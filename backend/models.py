from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from database import Base


class UserInsurance(Base):
    __tablename__ = "user_insurance"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    gender = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
