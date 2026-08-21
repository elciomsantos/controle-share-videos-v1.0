import api from "./api.service";

export interface AccessReviewRecord {
  id: string;
  email: string;
  username: string;
  role: "admin" | "operador";
  isAdmin: boolean;
  isActivated: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sharesOwned: number;
  sharesAccessible: number;
  mfaEnabled: boolean;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  status: "current" | "overdue" | "never_reviewed";
  riskLevel: "low" | "medium" | "high";
}

export interface ReviewCertifyDto {
  userId: string;
  certified: boolean;
  notes: string;
  reviewerId: string;
}

const list = async (): Promise<AccessReviewRecord[]> => {
  return (await api.get("/admin/access-review")).data;
};

const certify = async (dto: ReviewCertifyDto) => {
  return (await api.post("/admin/access-review/certify", dto)).data;
};

export default { list, certify };
