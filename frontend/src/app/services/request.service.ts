import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RequestItem {
  id: number;
  req_code: string;
  user_id: string;
  requester_email: string;
  title: string;
  request_type: string;
  target_system: string;
  reason: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  approved_by_sub?: string;
  reject_reason?: string;
  submitted_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_sub: string;
  actor_email?: string;
  action: string;
  target_request_id: number;
  details: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class RequestService {
  private apiUrl = 'http://localhost:8080/api/v1';

  constructor(private http: HttpClient) {}

  // Health / Protected Check
  getProtected(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/protected`);
  }

  // 1. REQUEST_USER
  createRequest(data: { title: string; request_type: string; target_system: string; reason: string }): Observable<RequestItem> {
    return this.http.post<RequestItem>(`${this.apiUrl}/requests`, data);
  }

  updateDraft(id: number, data: { title?: string; request_type?: string; target_system?: string; reason?: string }): Observable<RequestItem> {
    return this.http.put<RequestItem>(`${this.apiUrl}/requests/${id}`, data);
  }

  submitRequest(id: number): Observable<RequestItem> {
    return this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/submit`, {});
  }

  getMyRequests(): Observable<RequestItem[]> {
    return this.http.get<RequestItem[]>(`${this.apiUrl}/requests`);
  }

  getRequestById(id: number): Observable<RequestItem> {
    return this.http.get<RequestItem>(`${this.apiUrl}/requests/${id}`);
  }

  // 2. REQUEST_APPROVER
  getPendingRequests(): Observable<RequestItem[]> {
    return this.http.get<RequestItem[]>(`${this.apiUrl}/approvals/pending`);
  }

  approveRequest(id: number): Observable<RequestItem> {
    return this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/approve`, {});
  }

  rejectRequest(id: number, rejectReason: string): Observable<RequestItem> {
    return this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/reject`, { reject_reason: rejectReason });
  }

  // 3. REQUEST_ADMIN
  getAllRequests(): Observable<RequestItem[]> {
    return this.http.get<RequestItem[]>(`${this.apiUrl}/admin/requests`);
  }

  getAuditLogs(): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${this.apiUrl}/admin/audit-logs`);
  }
}