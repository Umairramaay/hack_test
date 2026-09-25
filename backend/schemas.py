from typing import List, Optional
from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    page: Optional[int] = None
    section: Optional[str] = None


class DocumentInfo(BaseModel):
    filename: str = ""
    document_type: Optional[str] = None
    page_count: Optional[int] = None


class PolicyOverview(BaseModel):
    insurer: Optional[str] = None
    policy_name: Optional[str] = None
    policy_type: Optional[str] = None
    policy_period: Optional[str] = None
    geographical_coverage: Optional[str] = None


class CoverageItem(BaseModel):
    category: str = ""
    covered: Optional[bool] = None
    description: str = ""
    limit: Optional[str] = None
    reimbursement: Optional[str] = None
    copayment: Optional[str] = None
    deductible: Optional[str] = None
    frequency_limit: Optional[str] = None
    waiting_period: Optional[str] = None
    authorization_required: Optional[bool] = None
    network_requirement: Optional[str] = None
    restrictions: List[str] = Field(default_factory=list)
    source: SourceRef = Field(default_factory=SourceRef)


class ExclusionItem(BaseModel):
    title: str = ""
    description: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class WaitingPeriodItem(BaseModel):
    benefit: str = ""
    period: str = ""
    description: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class FinancialLimitItem(BaseModel):
    benefit: str = ""
    limit: str = ""
    period: str = ""
    conditions: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class NetworkRuleItem(BaseModel):
    rule: str = ""
    description: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class PreventiveCareItem(BaseModel):
    benefit: str = ""
    description: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class ImportantConditionItem(BaseModel):
    title: str = ""
    description: str = ""
    importance: str = "high"
    source: SourceRef = Field(default_factory=SourceRef)


class PracticalQuestionItem(BaseModel):
    question: str = ""
    answer: str = ""
    source: SourceRef = Field(default_factory=SourceRef)


class InsuranceAnalysisResult(BaseModel):
    document: DocumentInfo = Field(default_factory=DocumentInfo)
    policy_overview: PolicyOverview = Field(default_factory=PolicyOverview)
    executive_summary: str = ""
    coverage: List[CoverageItem] = Field(default_factory=list)
    exclusions: List[ExclusionItem] = Field(default_factory=list)
    waiting_periods: List[WaitingPeriodItem] = Field(default_factory=list)
    financial_limits: List[FinancialLimitItem] = Field(default_factory=list)
    network_rules: List[NetworkRuleItem] = Field(default_factory=list)
    preventive_care: List[PreventiveCareItem] = Field(default_factory=list)
    important_conditions: List[ImportantConditionItem] = Field(default_factory=list)
    practical_questions: List[PracticalQuestionItem] = Field(default_factory=list)
    unclear_or_missing_information: List[str] = Field(default_factory=list)
