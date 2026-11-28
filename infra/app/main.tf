terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket         = "fitmentor-tfstate-836090573337"
    key            = "fitmentor/lambda.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "fitmentor-tfstate-lock"
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "dsql_url" {
  type        = string
  description = "Aurora DSQL connection string for community data. Empty keeps community in CockroachDB."
  sensitive   = true
  default     = ""
}

variable "api_shared_secret" {
  type      = string
  sensitive = true
}

variable "polar_access_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "polar_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "polar_premium_product_id" {
  type    = string
  default = "ebe9f020-45c6-48e8-bece-c010ac11d893"
}

variable "polar_premium_price_id" {
  type    = string
  default = "ff85613e-c183-42ae-a726-d5726a8146a8"
}

variable "polar_pro_product_id" {
  type    = string
  default = "343b9340-f3eb-435b-ac90-155a8fa72c18"
}

variable "polar_pro_price_id" {
  type    = string
  default = "1a9aec0d-86f2-4dfe-bd4d-af600d344ddf"
}

variable "polar_api_base" {
  type    = string
  default = "https://api.polar.sh"
}

variable "app_url" {
  type    = string
  default = "https://fitmentor-ey9.pages.dev"
}

variable "jwt_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "jwt_ttl_days" {
  type    = number
  default = 30
}

variable "google_client_ids" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "google_web_client_id" {
  type    = string
  default = ""
}

variable "google_web_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "google_web_redirect_uri" {
  type    = string
  default = "https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws/v1/auth/google/callback"
}

variable "ai_worker_url" {
  type    = string
  default = "https://fitmentor-ey9.pages.dev/api/ai/complete"
}

variable "api_zip" {
  type        = string
  description = "Path to the api Lambda zip (cargo lambda build --output-format zip)"
  default     = "../../api/target/lambda/api/bootstrap.zip"
}

variable "planner_zip" {
  type        = string
  description = "Path to the planner Lambda zip"
  default     = "../../api/target/lambda/planner/bootstrap.zip"
}

variable "log_retention_days" {
  type    = number
  default = 14
}

locals {
  dsql_enabled = trimspace(var.dsql_url) != ""
  dsql_cluster_id = local.dsql_enabled ? try(
    regex("^postgres[^:]*://[^@]+@([^.]+)", var.dsql_url)[0],
    "",
  ) : ""
  dsql_cluster_arn = local.dsql_cluster_id != "" ? (
    "arn:aws:dsql:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/${local.dsql_cluster_id}"
  ) : ""

  environment = {
    RUST_LOG                 = "info"
    DATABASE_URL             = var.database_url
    DSQL_URL                 = var.dsql_url
    API_SHARED_SECRET        = var.api_shared_secret
    AI_WORKER_URL            = var.ai_worker_url
    POLAR_ACCESS_TOKEN       = var.polar_access_token
    POLAR_WEBHOOK_SECRET     = var.polar_webhook_secret
    POLAR_PREMIUM_PRODUCT_ID = var.polar_premium_product_id
    POLAR_PREMIUM_PRICE_ID   = var.polar_premium_price_id
    POLAR_PRO_PRODUCT_ID     = var.polar_pro_product_id
    POLAR_PRO_PRICE_ID       = var.polar_pro_price_id
    POLAR_API_BASE           = var.polar_api_base
    APP_URL                  = var.app_url
    JWT_SECRET               = var.jwt_secret
    JWT_TTL_DAYS             = tostring(var.jwt_ttl_days)
    GOOGLE_CLIENT_IDS        = var.google_client_ids
    GOOGLE_CLIENT_SECRET     = var.google_client_secret
    GOOGLE_WEB_CLIENT_ID     = var.google_web_client_id
    GOOGLE_WEB_CLIENT_SECRET = var.google_web_client_secret
    GOOGLE_WEB_REDIRECT_URI  = var.google_web_redirect_uri
    GOOGLE_TOKENINFO_URL     = "https://oauth2.googleapis.com/tokeninfo"
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "fitmentor-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_dsql" {
  count = local.dsql_enabled ? 1 : 0
  name  = "fitmentor-dsql"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dsql:DbConnectAdmin"]
      Resource = local.dsql_cluster_arn
    }]
  })

  lifecycle {
    precondition {
      condition     = local.dsql_cluster_id != ""
      error_message = "DSQL_URL must look like postgresql://<user>@<cluster-id>... so Terraform can scope the IAM policy."
    }
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/fitmentor-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "planner" {
  name              = "/aws/lambda/fitmentor-planner"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "fitmentor-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["x86_64"]
  memory_size      = 256
  timeout          = 900
  filename         = var.api_zip
  source_code_hash = filebase64sha256(var.api_zip)

  environment {
    variables = local.environment
  }

  # Attach the DSQL policy before the first cold start that uses it.
  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.lambda_dsql]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "api_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_function" "planner" {
  function_name    = "fitmentor-planner"
  role             = aws_iam_role.lambda.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["x86_64"]
  memory_size      = 512
  timeout          = 900
  filename         = var.planner_zip
  source_code_hash = filebase64sha256(var.planner_zip)

  environment {
    variables = local.environment
  }

  depends_on = [aws_cloudwatch_log_group.planner]
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "fitmentor-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

resource "aws_iam_role_policy" "scheduler_invoke_planner" {
  name = "invoke-planner"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.planner.arn
    }]
  })
}

resource "aws_scheduler_schedule" "planner_daily" {
  name       = "fitmentor-planner-daily"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = "cron(30 0 * * ? *)"

  target {
    arn      = aws_lambda_function.planner.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "planner" })
  }
}

output "api_function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "api_function_name" {
  value = aws_lambda_function.api.function_name
}

output "planner_function_name" {
  value = aws_lambda_function.planner.function_name
}
