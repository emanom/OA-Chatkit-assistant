locals {
  cluster_name           = var.cluster_name != "" ? var.cluster_name : "${var.name}-cluster"
  attachments_bucket_arn = var.attachments_bucket_name != "" ? "arn:aws:s3:::${var.attachments_bucket_name}" : ""
}

locals {
  task_policy_statements = concat(
    var.chatkit_store_table_arn != "" ? [
      {
        Sid    = "DynamoAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ]
        Resource = [
          var.chatkit_store_table_arn,
          "${var.chatkit_store_table_arn}/index/*",
        ]
      }
    ] : [],
    local.attachments_bucket_arn != "" ? [
      {
        Sid    = "S3AttachmentsObjects"
        Effect = "Allow"
        Action = [
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:PutObject",
        ]
        Resource = "${local.attachments_bucket_arn}/*"
      },
      {
        Sid      = "S3AttachmentsList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = local.attachments_bucket_arn
      }
    ] : []
  )
}

resource "aws_ecs_cluster" "this" {
  name = local.cluster_name
}

resource "aws_iam_role" "task_execution" {
  name = "${var.name}-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name = "${var.name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  count = length(local.task_policy_statements) > 0 ? 1 : 0
  name  = "${var.name}-task-access"
  role  = aws_iam_role.task.id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.task_policy_statements
  })
}

resource "aws_cloudwatch_log_group" "service" {
  name              = "/ecs/${var.name}"
  retention_in_days = 14
}

resource "aws_security_group" "service" {
  name        = "${var.name}-svc-sg"
  description = "Allow traffic from ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-svc-sg"
  }
}

locals {
  environment = [
    for key, value in var.environment :
    {
      name  = key
      value = value
    }
  ]

  secrets = [
    for key, value in var.secrets :
    {
      name      = key
      valueFrom = value
    }
  ]

  secret_arns = [for value in var.secrets : value]
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "cascade"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = local.environment
      secrets     = local.secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-region        = data.aws_region.current.name
          awslogs-group         = aws_cloudwatch_log_group.service.name
          awslogs-stream-prefix = "cascade"
        }
      }
    }
  ])
}

data "aws_region" "current" {}

resource "aws_iam_role_policy" "task_execution_secrets" {
  count = length(local.secret_arns) > 0 ? 1 : 0
  name  = "${var.name}-task-secrets"
  role  = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSecretsManagerGet"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = local.secret_arns
      },
      {
        Sid    = "AllowKMSDecryptForSecrets"
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "${data.aws_region.current.name}.secretsmanager.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_ecs_service" "this" {
  name                              = "${var.name}-svc"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.this.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = var.health_check_grace_period

  network_configuration {
    assign_public_ip = var.assign_public_ip
    security_groups  = [aws_security_group.service.id]
    subnets          = var.subnet_ids
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "cascade"
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

