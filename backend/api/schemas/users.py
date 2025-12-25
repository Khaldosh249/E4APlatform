from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from db.users import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.STUDENT
    is_blind: bool = False
    voice_speed: int = 1
    preferred_language: str = "en"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_blind: Optional[bool] = None
    voice_speed: Optional[int] = None
    preferred_language: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    old_password: str
    new_password: str
