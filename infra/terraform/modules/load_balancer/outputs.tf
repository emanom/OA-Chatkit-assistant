output "security_group_id" {
  description = "Security group ID attached to the ALB."
  value       = aws_security_group.alb.id
}

output "load_balancer_arn" {
  description = "ARN of the created load balancer."
  value       = aws_lb.this.arn
}

output "load_balancer_dns_name" {
  description = "DNS name of the load balancer."
  value       = aws_lb.this.dns_name
}

output "target_group_arn" {
  description = "Target group ARN for attaching ECS services."
  value       = aws_lb_target_group.http.arn
}

