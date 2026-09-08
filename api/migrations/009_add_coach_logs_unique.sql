ALTER TABLE coach_logs ADD CONSTRAINT coach_logs_user_container_key UNIQUE (user_id, container_tag);
