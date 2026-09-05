from datetime import datetime
import os
import sqlite3
import time
import cv2
import face_recognition
import numpy as np

STREAM_URL = os.getenv(
    "STREAM_URL", "https://213445016402c3.lhr.life/video"
)
DB_FILE = "attendance.db"

# ১. ডাটাবেস টেবিল
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

# ২. ছবি লোড করা
known_names = []
known_encodings = []

FACES_DIR = "faces"
if os.path.exists(FACES_DIR):
  for f in os.listdir(FACES_DIR):
    if f.lower().endswith((".jpg", ".png")):
      img = face_recognition.load_image_file(os.path.join(FACES_DIR, f))
      enc = face_recognition.face_encodings(img)
      if enc:
        known_encodings.append(enc[0])
        name = os.path.splitext(f)[0]
        known_names.append(name)
        print(f"Loaded student: {name}")

print(f"Total students registered: {len(known_names)}")


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
    print(f"✅ [PRESENT] {name} at {now_time}")
  except sqlite3.IntegrityError:
    pass
  finally:
    conn.close()


# ৩. ভিডিও স্ট্রিম প্রসেসিং
print(f"Connecting to camera stream: {STREAM_URL}")
cap = cv2.VideoCapture(STREAM_URL)

last_check = 0
INTERVAL = 1.0  # প্রতি ১ সেকেন্ডে ১ বার ফেস চেক করবে

while True:
  ret, frame = cap.read()
  if not ret:
    print("Stream disconnected, reconnecting in 5s...")
    time.sleep(5)
    cap = cv2.VideoCapture(STREAM_URL)
    continue

  now = time.time()
  if now - last_check > INTERVAL:
    last_check = now

    small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

    locs = face_recognition.face_locations(rgb, model="hog")
    if locs:
      encs = face_recognition.face_encodings(rgb, locs)
      for enc in encs:
        matches = face_recognition.compare_faces(
            known_encodings, enc, tolerance=0.5
        )
        if True in matches:
          dists = face_recognition.face_distance(known_encodings, enc)
          best = np.argmin(dists)
          student = known_names[best]
          mark_present(student)
