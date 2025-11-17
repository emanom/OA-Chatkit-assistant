terraform {
  required_version = ">= 1.5.0"
}

variable "name" {
  description = "Prefix used for all networking resources."
  type        = string
}

variable "cidr_block" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "azs" {
  description = "List of availability zones to spread subnets across."
  type        = list(string)
  default     = ["ap-southeast-2a", "ap-southeast-2b"]
}


