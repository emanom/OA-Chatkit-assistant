locals {
  project_name = "fyi-cascade"
}

module "network" {
  source = "../../modules/network"

  name       = local.project_name
  cidr_block = "10.30.0.0/16"
  azs        = ["${var.aws_region}a", "${var.aws_region}b"]
}

module "load_balancer" {
  source = "../../modules/load_balancer"

  name       = local.project_name
  vpc_id     = module.network.vpc_id
  subnet_ids = module.network.public_subnet_ids
  # Provide an ACM certificate ARN via TF_VAR_certificate_arn if HTTPS is required
  certificate_arn      = try(var.certificate_arn, "")
  enable_http_redirect = true
}

module "ecs_service" {
  source = "../../modules/ecs_service"

  name                  = local.project_name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  target_group_arn      = module.load_balancer.target_group_arn
  alb_security_group_id = module.load_balancer.security_group_id
  container_image       = var.container_image
  desired_count         = 1
  cpu                   = 1024
  memory                = 2048
  assign_public_ip      = true
  environment = merge(
    {
      PORT                        = "3000"
      ROUTER_CONFIDENCE_THRESHOLD = "0.75"
      VECTOR_STORE_ID             = var.vector_store_id
      PROMPT_CACHE_ENABLED        = "true"
      HEAVY_REASONING             = "low"
      HEAVY_MAX_OUTPUT_TOKENS     = "900"
    },
    var.additional_environment
  )
  secrets = merge(
    {
      OPENAI_API_KEY = var.openai_api_key_secret_arn
    },
    var.openai_domain_key_secret_arn != "" ? {
      OPENAI_DOMAIN_KEY = var.openai_domain_key_secret_arn
    } : {}
  )
}

output "alb_dns_name" {
  value       = module.load_balancer.load_balancer_dns_name
  description = "Public DNS name of the Application Load Balancer."
}

output "service_name" {
  value       = module.ecs_service.service_name
  description = "Name of the ECS service."
}

