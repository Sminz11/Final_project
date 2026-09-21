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
  selectedType: string = '';

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPendingRequests();
  }

  // Helper สำหรับสร้าง Headers ที่แนบทั้ง Bearer Token และ X-User-Email
  private getAuthHeaders(callback: (headers: HttpHeaders) => void) {
    combineLatest([
      this.auth.getAccessTokenSilently(),
      this.auth.user$
    ]).pipe(take(1)).subscribe({
      next: ([token, user]) => {
        let headers = new HttpHeaders({
          'Authorization': `Bearer ${token}`
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

  loadPendingRequests() {
    this.loading = true;
    this.getAuthHeaders((headers) => {
      this.http.get<any[]>('http://localhost:8080/api/v1/approvals/pending', { headers }).subscribe({
        next: (res) => {
          this.pendingRequests = res.map(item => {
            // ดึงค่า requester_email จาก Backend เป็นหลัก
            const rawEmail = item.requester_email || item.user_email || item.email || '';

            return {
              ...item,
              // แสดงอีเมลจริงที่ทำรายการเข้ามา หากไม่มีให้ใช้ user_id
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

  applyFilter() {
    this.filteredRequests = this.pendingRequests.filter(item => {
      const matchesSearch = !this.searchTerm || 
        (item.req_code && item.req_code.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (item.user_id && item.user_id.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (item.display_email && item.display_email.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (item.title && item.title.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (item.target_system && item.target_system.toLowerCase().includes(this.searchTerm.toLowerCase()));

      const matchesType = !this.selectedType || item.request_type === this.selectedType;

      return matchesSearch && matchesType;
    });
  }

  approveRequest(id: number, reqCode: string) {
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

  rejectRequest(id: number, reqCode: string) {
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

  private sendApprove(id: number) {
    this.getAuthHeaders((headers) => {
      this.http.post(`http://localhost:8080/api/v1/requests/${id}/approve`, {}, { headers }).subscribe({
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
            text: err.error?.error || err.error?.message || 'ไม่สามารถอนุมัติรายการได้',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          });
        }
      });
    });
  }

  private sendReject(id: number, rejectReason: string) {
    this.getAuthHeaders((headers) => {
      const jsonHeaders = headers.set('Content-Type', 'application/json');
      const payload = { reject_reason: rejectReason };

      this.http.post(`http://localhost:8080/api/v1/requests/${id}/reject`, payload, { headers: jsonHeaders }).subscribe({
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
            text: err.error?.error || err.error?.message || 'ไม่สามารถปฏิเสธรายการได้',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          });
        }
      });
    });
  }
}