variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-southeast-2"
}

variable "container_image" {
  description = "ECR image URI for the cascade service."
  type        = string
}

variable "openai_api_key_secret_arn" {
  description = "Secrets Manager or SSM parameter ARN containing the OpenAI API key."
  type        = string
}

variable "openai_domain_key_secret_arn" {
  description = "Optional secret ARN containing the OpenAI domain key."
  type        = string
  default     = ""
}

variable "vector_store_id" {
  description = "FYI vector store ID used by the heavy agent."
  type        = string
}

variable "additional_environment" {
  description = "Optional additional environment variables."
  type        = map(string)
  default     = {}
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN for HTTPS."
  type        = string
  default     = ""
}

