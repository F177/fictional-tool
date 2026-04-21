"""
RQ worker entrypoint.
Run from the backend/ directory:
    python worker.py
"""

import redis
from rq import Queue, Worker

if __name__ == "__main__":
    conn = redis.Redis()
    q = Queue(connection=conn)
    w = Worker([q], connection=conn)
    print("Worker started — listening on default queue")
    w.work()
