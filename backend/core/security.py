import os
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "testing")
ALGORITHM = "HS256"


def hash_password(password: str):
    
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    return hashed.decode('utf-8')

def verify_password(password: str, hashed: str):
    
    password_bytes = password.encode('utf-8')
    hashed_bytes = hashed.encode('utf-8')
    
    return bcrypt.checkpw(password_bytes, hashed_bytes)

def create_access_token(data: dict):
    
    payload = data.copy()
    payload["exp"] = datetime.now() + timedelta(hours=24)
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
