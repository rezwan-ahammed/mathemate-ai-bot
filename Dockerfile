FROM python:3.10-slim

# ডেবিয়ানের অফিসিয়াল প্রি-বিল্ট dlib ও সিস্টেম লাইব্রেরি ইনস্টল
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-dlib \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# সিস্টেম প্যাকেজ যাতে pip দিয়ে ব্যবহার করা যায়
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "worker.py"]
