export interface DiagnosticResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

export interface DoctorResult {
  success: boolean;
  checks: DiagnosticResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}
