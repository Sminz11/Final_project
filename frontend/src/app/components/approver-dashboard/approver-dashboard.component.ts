
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, take } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-approver',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule
  ],
  templateUrl: './approver-dashboard.component.html',
  styleUrls: ['./approver-dashboard.component.css']
})
export class ApproverDashboardComponent implements OnInit {
  pendingRequests: any[] = [];
  filteredRequests: any[] = [];
  loading: boolean = false;

  searchTerm: string = '';
  readonly maxSearchLength: number = 150;

  selectedType: string = '';

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPendingRequests();
  }

  // สร้าง Headers สำหรับเรียก API พร้อม Access Token
  private getAuthHeaders(callback: (headers: HttpHeaders) => void) {
    combineLatest([
      this.auth.getAccessTokenSilently(),
      this.auth.user$
    ]).pipe(take(1)).subscribe({
      next: ([token, user]) => {
        let headers = new HttpHeaders({
          Authorization: `Bearer ${token}`
        });

        if (user && user.email) {
          headers = headers.set('X-User-Email', user.email);
        }

        callback(headers);
      },
      error: (err) => {
        console.error('Auth Header Error:', err);
        this.loading = false;
      }
    });
  }

  loadPendingRequests(): void {
    this.loading = true;

    this.getAuthHeaders((headers) => {
      this.http.get<any[]>(
        'http://localhost:8080/api/v1/approvals/pending',
        { headers }
      ).subscribe({
        next: (res) => {
          this.pendingRequests = (res || []).map(item => {
            const rawEmail =
              item.requester_email ||
              item.user_email ||
              item.email ||
              '';

            return {
              ...item,
              display_email: rawEmail || item.user_id || 'N/A'
            };
          });

          this.applyFilter();
          this.loading = false;
        },
        error: (err) => {
          console.error('Fetch pending requests error:', err);
          this.loading = false;
        }
      });
    });
  }

  // ค้นหาจากข้อมูลคำขอและกรองตามประเภท
  applyFilter(): void {
    const term = (this.searchTerm || '')
      .slice(0, this.maxSearchLength)
      .trim()
      .toLocaleLowerCase();

    this.filteredRequests = this.pendingRequests.filter(item => {
      // ฟิลด์ที่ต้องการค้นหาโดยเฉพาะ
      const searchableValues: unknown[] = [
        item.id,
        item.req_code,
        item.request_code,
        item.user_id,
        item.requester_sub,
        item.requester_email,
        item.user_email,
        item.email,
        item.display_email,
        item.title,
        item.request_type,
        item.target_system,
        item.status,
        item.reason,
        item.reject_reason,
        item.rejectReason,
        item.created_at,
        item.createdAt,
        item.submitted_at,
        item.submittedAt
      ];

      // รวมฟิลด์ข้อความ ตัวเลข และ boolean อื่น ๆ
      // ที่ API ส่งมาในแต่ละรายการ
      if (item && typeof item === 'object') {
        Object.values(item).forEach((value: unknown) => {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            searchableValues.push(value);
          }
        });
      }

      const matchesSearch =
        !term ||
        searchableValues.some((value: unknown) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(term)
        );

      const matchesType =
        !this.selectedType ||
        String(item.request_type ?? '').toUpperCase().trim() ===
          this.selectedType.toUpperCase().trim();

      return matchesSearch && matchesType;
    });
  }

  approveRequest(id: number, reqCode: string): void {
    Swal.fire({
      title: 'ยืนยันการอนุมัติคำขอ?',
      text: `คุณต้องการอนุมัติรายการคำขอ [${reqCode}] ใช่หรือไม่`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'อนุมัติ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.sendApprove(id);
      }
    });
  }

  rejectRequest(id: number, reqCode: string): void {
    Swal.fire({
      title: 'ปฏิเสธคำขอเข้าใช้งาน?',
      text: `ระบุเหตุผลในการปฏิเสธคำขอ [${reqCode}]:`,
      input: 'textarea',
      inputPlaceholder: 'กรอกเหตุผลที่ปฏิเสธ...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true,
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return 'กรุณาระบุเหตุผลการปฏิเสธ';
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        this.sendReject(id, result.value);
      }
    });
  }

  private sendApprove(id: number): void {
    this.getAuthHeaders((headers) => {
      this.http.post(
        `http://localhost:8080/api/v1/requests/${id}/approve`,
        {},
        { headers }
      ).subscribe({
        next: () => {
          Swal.fire({
            title: 'สำเร็จ!',
            text: 'อนุมัติรายการเรียบร้อยแล้ว',
            icon: 'success',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          }).then(() => {
            this.loadPendingRequests();
          });
        },
        error: (err) => {
          console.error('Approve Error:', err);
          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถอนุมัติรายการได้',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          });
        }
      });
    });
  }

  private sendReject(id: number, rejectReason: string): void {
    this.getAuthHeaders((headers) => {
      const jsonHeaders = headers.set(
        'Content-Type',
        'application/json'
      );

      const payload = {
        reject_reason: rejectReason
      };

      this.http.post(
        `http://localhost:8080/api/v1/requests/${id}/reject`,
        payload,
        { headers: jsonHeaders }
      ).subscribe({
        next: () => {
          Swal.fire({
            title: 'สำเร็จ!',
            text: 'ปฏิเสธรายการเรียบร้อยแล้ว',
            icon: 'success',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          }).then(() => {
            this.loadPendingRequests();
          });
        },
        error: (err) => {
          console.error('Reject Error:', err);
          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถปฏิเสธรายการได้',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          });
        }
      });
    });
  }
}
