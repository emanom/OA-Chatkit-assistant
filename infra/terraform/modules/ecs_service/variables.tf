terraform {
  required_version = ">= 1.5.0"
}

variable "name" {
  description = "Prefix for ECS resources."
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name."
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnets where the service tasks will run."
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID for security groups."
  type        = string
}

variable "target_group_arn" {
  description = "Target group ARN for load balancer integration."
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID attached to the ALB."
  type        = string
}

variable "container_image" {
  description = "Full image URI for the cascade container."
  type        = string
}

variable "desired_count" {
  description = "Number of tasks to run."
  type        = number
  default     = 1
}

variable "cpu" {
  description = "CPU units for the task definition."
  type        = number
  default     = 1024
}

variable "memory" {
  description = "Hard memory limit (in MiB)."
  type        = number
  default     = 2048
}

variable "environment" {
  description = "Plaintext environment variables for the container."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secrets to inject into the container (name => SSM/SecretsManager ARN)."
  type        = map(string)
  default     = {}
}

variable "assign_public_ip" {
  description = "Assign a public IP to the Fargate task."
  type        = bool
  default     = true
}

variable "health_check_grace_period" {
  description = "Seconds to ignore failing health checks on startup."
  type        = number
  default     = 60
}

variable "chatkit_store_table_name" {
  description = "DynamoDB table that stores ChatKit threads/items."
  type        = string
  default     = ""
}

variable "chatkit_store_threads_index" {
  description = "Name of the DynamoDB GSI used for listing threads."
  type        = string
  default     = "gsi1"
}

variable "chatkit_store_table_arn" {
  description = "ARN of the DynamoDB table backing the ChatKit store."
  type        = string
  default     = ""
}

variable "attachments_bucket_name" {
  description = "S3 bucket used for attachment uploads."
  type        = string
  default     = ""
}

