terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "fyi-cascade-tfstate-831926595680"
    key            = "fyi-cascade/prod/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "fyi-cascade-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

