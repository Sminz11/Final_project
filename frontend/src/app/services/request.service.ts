import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, firstValueFrom } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { AuthService } from '@auth0/auth0-angular';

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

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  // Helper สำหรับดึง Header X-User-Email โดยรอ Auth0 ทำงานเสร็จก่อน
  private getHeadersObservable(): Observable<{ headers: HttpHeaders }> {
    return this.auth.user$.pipe(
      take(1),
      switchMap(async (user) => {
        let headers = new HttpHeaders();
        if (user && user.email) {
          headers = headers.set('X-User-Email', user.email);
        }
        return { headers };
      })
    );
  }

  // Health / Protected Check
  getProtected(): Observable<any> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<any>(`${this.apiUrl}/protected`, options))
    );
  }

  // 1. REQUEST_USER
  createRequest(data: { title: string; request_type: string; target_system: string; reason: string }): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.post<RequestItem>(`${this.apiUrl}/requests`, data, options))
    );
  }

  updateDraft(id: number, data: { title?: string; request_type?: string; target_system?: string; reason?: string }): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.put<RequestItem>(`${this.apiUrl}/requests/${id}`, data, options))
    );
  }

  submitRequest(id: number): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/submit`, {}, options))
    );
  }

  getMyRequests(): Observable<RequestItem[]> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<RequestItem[]>(`${this.apiUrl}/requests`, options))
    );
  }

  getRequestById(id: number): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<RequestItem>(`${this.apiUrl}/requests/${id}`, options))
    );
  }

  // 2. REQUEST_APPROVER
  getPendingRequests(): Observable<RequestItem[]> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<RequestItem[]>(`${this.apiUrl}/approvals/pending`, options))
    );
  }

  approveRequest(id: number): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/approve`, {}, options))
    );
  }

  rejectRequest(id: number, rejectReason: string): Observable<RequestItem> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.post<RequestItem>(`${this.apiUrl}/requests/${id}/reject`, { reject_reason: rejectReason }, options))
    );
  }

  // 3. REQUEST_ADMIN
  getAllRequests(): Observable<RequestItem[]> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<RequestItem[]>(`${this.apiUrl}/admin/requests`, options))
    );
  }

  getAuditLogs(): Observable<AuditLog[]> {
    return this.getHeadersObservable().pipe(
      switchMap((options) => this.http.get<AuditLog[]>(`${this.apiUrl}/admin/audit-logs`, options))
    );
  }
}