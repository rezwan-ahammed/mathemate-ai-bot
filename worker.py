from datetime import datetime
import os
import sqlite3
import time
import cv2
from deepface import DeepFace
import numpy as np

STREAM_URL = os.getenv(
    "STREAM_URL", "https://98988b5c1fbaa1.lhr.life/video"
)
DB_FILE = "attendance.db"
FACES_DIR = "faces"

# ডাটাবেস টেবিল তৈরি
conn = sqlite3.connect(DB_FILE)
c = conn.cursor()
c.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        student_name TEXT,
        date TEXT,
        time TEXT,
        UNIQUE(student_name, date)
    )
""")
conn.commit()
conn.close()


def mark_present(name):
  today = datetime.now().strftime("%Y-%m-%d")
  now_time = datetime.now().strftime("%H:%M:%S")

  conn = sqlite3.connect(DB_FILE)
  c = conn.cursor()
  try:
    c.execute(
        """
            INSERT INTO attendance (student_name, date, time)
            VALUES (?, ?, ?)
        """,
        (name, today, now_time),
    )
    conn.commit()
    print(f"🎉 [PRESENT] {name} at {now_time}")
  except sqlite3.IntegrityError:
    pass
  finally:
    conn.close()


print(f"Connecting to stream: {STREAM_URL}")
cap = cv2.VideoCapture(STREAM_URL)

last_check = 0
INTERVAL = 2.0  # প্রতি ২ সেকেন্ডে ১ বার ফেস চেক করবে

while True:
  ret, frame = cap.read()
  if not ret:
    print("Stream disconnected, retrying in 5s...")
    time.sleep(5)
    cap = cv2.VideoCapture(STREAM_URL)
    continue

  now = time.time()
  if now - last_check > INTERVAL:
    last_check = now

    small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)

    try:
      # faces ফোল্ডারের ছবির সাথে রিয়েল-টাইম ম্যাচ
      dfs = DeepFace.find(
          img_path=small_frame,
          db_path=FACES_DIR,
          model_name="Facenet",
          detector_backend="opencv",
          enforce_detection=False,
          silent=True,
      )

      if len(dfs) > 0 and not dfs[0].empty:
        matched_path = dfs[0]["identity"][0]
        matched_name = os.path.splitext(os.path.basename(matched_path))[0]
        mark_present(matched_name)
    except Exception as e:
      pass
