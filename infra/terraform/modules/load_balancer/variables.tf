terraform {
  required_version = ">= 1.5.0"
}

variable "name" {
  description = "Prefix for load balancer resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the load balancer will live."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the load balancer."
  type        = list(string)
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN for HTTPS listener."
  type        = string
  default     = ""
}

variable "enable_http_redirect" {
  description = "Whether to create an HTTP listener that redirects to HTTPS."
  type        = bool
  default     = true
}
