import enum


class GroupRole(str, enum.Enum):
    owner = "owner"
    member = "member"


class ReceiptStatus(str, enum.Enum):
    pending_ocr = "pending_ocr"
    pending_review = "pending_review"
    confirmed = "confirmed"
    assigned = "assigned"
    ocr_failed = "ocr_failed"


class ShareType(str, enum.Enum):
    full = "full"
    equal = "equal"
    percentage = "percentage"


class SplitType(str, enum.Enum):
    equal = "equal"
    full = "full"
    percentage = "percentage"
