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

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "api_shared_secret" {
  type      = string
  sensitive = true
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
  environment = {
    RUST_LOG          = "info"
    DATABASE_URL      = var.database_url
    API_SHARED_SECRET = var.api_shared_secret
    AI_WORKER_URL     = var.ai_worker_url
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

  depends_on = [aws_cloudwatch_log_group.api]
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
