import User from "../types/user.type";

const isAdminOrAuditor = (user: User | null | undefined): boolean =>
  !!user && (user.isAdmin || user.role === "auditor" || user.role === "admin");

export default isAdminOrAuditor;
