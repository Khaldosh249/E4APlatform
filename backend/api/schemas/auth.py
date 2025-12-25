from pydantic import BaseModel


class LoginSchema(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class TokenSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenDataSchema(BaseModel):
    user_id: int
    role: str
    is_active: bool
    exp: int





