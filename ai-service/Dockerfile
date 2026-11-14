FROM python:3.12.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/burnoutsense/ai-service
# Render manages SSH keys. Discard a random password instead of leaving a locked
# root account or installing an SSH server in the application container.
RUN install -d -m 0700 /root/.ssh && python -c "import secrets,subprocess; subprocess.run(['chpasswd'],input='root:'+secrets.token_urlsafe(48)+'\n',text=True,check=True)"
COPY requirements-linux-py312.lock ./
RUN pip install --no-cache-dir -r requirements-linux-py312.lock && pip check
COPY app ./app
COPY training ./training
# The private RF/A package is mounted separately, never copied into this image.
CMD ["sh", "-c", "exec python -B -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
