FROM python:3.10-slim

# বেসিক রানিং প্যাকেজ (ভারী C++ কম্পাইলার ছাড়া)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# প্রি-বিল্ট লাইটওয়েট হুইল ব্যবহার
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "worker.py"]
