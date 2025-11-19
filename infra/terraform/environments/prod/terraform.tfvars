container_image              = "831926595680.dkr.ecr.ap-southeast-2.amazonaws.com/fyi-cascade:latest"
openai_api_key_secret_arn    = "arn:aws:secretsmanager:ap-southeast-2:831926595680:secret:OPENAI_API_KEY-wAh6ar"
openai_domain_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-2:831926595680:secret:OPENAI_DOMAIN_KEY-zR7LPa"
vector_store_id              = "vs_68f6372d0fc48191a629f4a6eb0a7806"
additional_environment = {
  ROUTER_MODEL = "gpt-5-nano"
  # OPENAI_DOMAIN_KEY = "domain_pk_xxxxx"
}

chatkit_store_table_name    = "fyi-cascade-chatkit"
chatkit_store_threads_index = "gsi1"
attachments_bucket_name     = "pubsupchat-attach"

