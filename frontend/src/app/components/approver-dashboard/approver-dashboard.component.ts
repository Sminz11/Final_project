
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, take } from 'rxjs';
import Swal from 'sweetalert2';

interface DetailField {
  key: string;
  label: string;
  value: string;
  isLongText: boolean;
}

@Component({
  selector: 'app-approver',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './approver-dashboard.component.html',
  styleUrls: ['./approver-dashboard.component.css']
})
export class ApproverDashboardComponent implements OnInit {
  pendingRequests: any[] = [];
  filteredRequests: any[] = [];

  loading = false;
  searchTerm = '';
  readonly maxSearchLength = 150;
  selectedType = '';

  showDetailModal = false;
  selectedDetail: any = null;

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadPendingRequests();
  }

  // เตรียม Authorization Header จาก Auth0
  private getAuthHeaders(
    callback: (headers: HttpHeaders) => void
  ): void {
    combineLatest([
      this.auth.getAccessTokenSilently(),
      this.auth.user$
    ])
      .pipe(take(1))
      .subscribe({
        next: ([token, user]) => {
          let headers = new HttpHeaders({
            Authorization: `Bearer ${token}`
          });

          if (user?.email) {
            headers = headers.set('X-User-Email', user.email);
          }

          callback(headers);
        },
        error: (err) => {
          console.error('Auth Header Error:', err);
          this.loading = false;

          Swal.fire({
            title: 'ยืนยันตัวตนไม่สำเร็จ',
            text: 'ไม่สามารถเตรียมข้อมูลสำหรับเรียก API ได้',
            icon: 'error'
          });
        }
      });
  }

  // โหลดรายการคำขอ
  loadPendingRequests(): void {
    this.loading = true;

    this.getAuthHeaders((headers) => {
      this.http.get<any[]>(
        'http://localhost:8080/api/v1/approvals/pending',
        { headers }
      ).subscribe({
        next: (res) => {
          this.pendingRequests = (Array.isArray(res) ? res : [])
            .map(item => ({
              ...item,

              req_code:
                item.req_code ||
                item.request_code ||
                item.reqCode ||
                `REQ-${item.id}`,

              display_email:
                item.requester_email ||
                item.user_email ||
                item.email ||
                'N/A',

              request_type:
                item.request_type ||
                item.requestType ||
                '-',

              target_system:
                item.target_system ||
                item.targetSystem ||
                '-',

              reason:
                item.reason ||
                item.description ||
                '',

              reject_reason:
                item.reject_reason ||
                item.rejectReason ||
                ''
            }));

          this.applyFilter();
          this.loading = false;

          // อัปเดตข้อมูลใน Modal หากกำลังเปิดอยู่
          if (this.showDetailModal && this.selectedDetail) {
            const updated = this.pendingRequests.find(
              item => item.id === this.selectedDetail.id
            );

            if (updated) {
              this.selectedDetail = updated;
            }
          }
        },
        error: (err) => {
          console.error('Fetch pending requests error:', err);
          this.loading = false;

          Swal.fire({
            title: 'โหลดข้อมูลไม่สำเร็จ',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถโหลดรายการรออนุมัติได้',
            icon: 'error'
          });
        }
      });
    });
  }

  // ค้นหาและกรองรายการ
  applyFilter(): void {
    const term = (this.searchTerm || '')
      .slice(0, this.maxSearchLength)
      .trim()
      .toLowerCase();

    this.filteredRequests = this.pendingRequests.filter(item => {
      const values = [
        item.req_code,
        item.request_code,
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
        item.created_at,
        item.submitted_at
      ];

      const matchesSearch =
        !term ||
        values.some(value =>
          String(value ?? '').toLowerCase().includes(term)
        );

      const matchesType =
        !this.selectedType ||
        String(item.request_type ?? '').toUpperCase().trim() ===
          this.selectedType.toUpperCase().trim();

      return matchesSearch && matchesType;
    });
  }

  // เปิด Modal รายละเอียด
  openDetailModal(item: any): void {
    this.selectedDetail = item;
    this.showDetailModal = true;
  }

  // ปิด Modal รายละเอียด
  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedDetail = null;
  }

  // ตรวจสอบว่ายังอนุมัติหรือปฏิเสธได้หรือไม่
  canDecide(item: any): boolean {
    return (
      item?.status === 'SUBMITTED' ||
      item?.status === 'PENDING'
    );
  }

  // สีสถานะ
  getStatusStyle(status: string): Record<string, string> {
    switch (String(status || '').toUpperCase()) {
      case 'SUBMITTED':
      case 'PENDING':
        return {
          'background-color': '#e0f2fe',
          color: '#0288d1'
        };

      case 'APPROVED':
        return {
          'background-color': '#dcfce7',
          color: '#15803d'
        };

      case 'REJECTED':
        return {
          'background-color': '#fee2e2',
          color: '#b91c1c'
        };

      default:
        return {
          'background-color': '#f1f5f9',
          color: '#475569'
        };
    }
  }

  // แปลงวันที่เป็นรูปแบบวัน/เดือน/ปี และเวลาไทย
  formatDetailDate(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  // ตรวจว่าฟิลด์เป็นวันที่หรือไม่
  private isDateField(key: string): boolean {
    return (
      /(^|_)(created_at|updated_at|submitted_at|approved_at|rejected_at|deleted_at|expires_at|expiry_date|start_date|end_date|date|datetime|timestamp)$/i
        .test(key) ||
      /At$/.test(key) ||
      /Date$/.test(key) ||
      /Timestamp$/.test(key)
    );
  }

  // ชื่อฟิลด์ที่ใช้แสดงใน Modal
  private getFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      id: 'รหัสภายในคำขอ',
      req_code: 'รหัสคำขอ',
      request_code: 'รหัสคำขอ',
      title: 'หัวข้อคำขอ',
      requester_name: 'ชื่อผู้ขอ',
      user_name: 'ชื่อผู้ขอ',
      display_name: 'ชื่อผู้ขอ',
      requester_email: 'อีเมลผู้ขอ',
      user_email: 'อีเมลผู้ขอ',
      email: 'อีเมลผู้ขอ',
      request_type: 'ประเภทสิทธิ์',
      target_system: 'ระบบเป้าหมาย',
      access_level: 'ระดับสิทธิ์',
      permission: 'สิทธิ์ที่ร้องขอ',
      requested_permission: 'สิทธิ์ที่ร้องขอ',
      environment: 'สภาพแวดล้อม',
      database_name: 'ชื่อฐานข้อมูล',
      server_name: 'ชื่อเซิร์ฟเวอร์',
      reason: 'เหตุผลในการขอสิทธิ์',
      description: 'รายละเอียดคำขอ',
      business_justification: 'เหตุผลทางธุรกิจ',
      duration: 'ระยะเวลาที่ขอสิทธิ์',
      access_duration: 'ระยะเวลาที่ขอสิทธิ์',
      start_date: 'วันที่เริ่มต้น',
      end_date: 'วันที่สิ้นสุด',
      expiry_date: 'วันหมดอายุ',
      status: 'สถานะ',
      created_at: 'วันที่สร้างคำขอ',
      submitted_at: 'วันที่ส่งคำขอ',
      updated_at: 'วันที่แก้ไขล่าสุด',
      approved_at: 'วันที่อนุมัติ',
      rejected_at: 'วันที่ปฏิเสธ',
      approver_name: 'ชื่อผู้พิจารณา',
      approver_email: 'อีเมลผู้พิจารณา',
      reject_reason: 'เหตุผลการปฏิเสธ',
      rejection_reason: 'เหตุผลการปฏิเสธ',
      approval_comment: 'ความคิดเห็นผู้อนุมัติ',
      comments: 'ความคิดเห็นเพิ่มเติม'
    };

    if (labels[key]) {
      return labels[key];
    }

    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  // เตรียมรายละเอียดทั้งหมดจากข้อมูลที่ API ส่งมา
  getDetailFields(item: any): DetailField[] {
    if (!item) {
      return [];
    }

    // ไม่แสดง ID ผู้ขอ, Auth ID หรือข้อมูลลับ
    const excludedKeys = new Set([
      'user_id',
      'auth_id',
      'requester_id',
      'requester_user_id',
      'access_token',
      'refresh_token',
      'id_token',
      'password',
      'secret',
      'client_secret'
    ]);

    // เรียงข้อมูลสำคัญให้อ่านง่าย
    const preferredOrder = [
      'req_code',
      'request_code',
      'title',
      'requester_name',
      'user_name',
      'display_name',
      'requester_email',
      'user_email',
      'email',
      'request_type',
      'target_system',
      'access_level',
      'permission',
      'requested_permission',
      'environment',
      'database_name',
      'server_name',
      'reason',
      'description',
      'business_justification',
      'duration',
      'access_duration',
      'start_date',
      'end_date',
      'expiry_date',
      'status',
      'created_at',
      'submitted_at',
      'updated_at',
      'approved_at',
      'rejected_at',
      'approver_name',
      'approver_email',
      'reject_reason',
      'rejection_reason',
      'approval_comment',
      'comments'
    ];

    const keys = [
      ...preferredOrder.filter(key =>
        Object.prototype.hasOwnProperty.call(item, key)
      ),
      ...Object.keys(item).filter(key =>
        !preferredOrder.includes(key)
      )
    ];

    const fields: DetailField[] = [];
    const seen = new Set<string>();

    for (const key of keys) {
      if (seen.has(key) || excludedKeys.has(key.toLowerCase())) {
        continue;
      }

      seen.add(key);

      const rawValue = item[key];

      if (
        rawValue === null ||
        rawValue === undefined ||
        rawValue === ''
      ) {
        continue;
      }

      let value: string;

      if (this.isDateField(key)) {
        value = this.formatDetailDate(rawValue);
      } else if (typeof rawValue === 'object') {
        value = JSON.stringify(rawValue, null, 2);
      } else if (typeof rawValue === 'boolean') {
        value = rawValue ? 'ใช่' : 'ไม่ใช่';
      } else {
        value = String(rawValue);
      }

      const lowerKey = key.toLowerCase();

      const isLongText =
        /reason|description|justification|comment|remark|detail|เหตุผล/i
          .test(lowerKey) ||
        /reason|description|justification|comment|remark|detail/i
          .test(value.length > 100 ? lowerKey : '');

      fields.push({
        key,
        label: this.getFieldLabel(key),
        value,
        isLongText
      });
    }

    return fields;
  }

  // อนุมัติจากปุ่มในตารางเท่านั้น
  approveRequest(id: number, reqCode: string): void {
    Swal.fire({
      title: 'ยืนยันการอนุมัติคำขอ?',
      text: `คุณต้องการอนุมัติคำขอ [${reqCode}] ใช่หรือไม่`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'อนุมัติ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true
    }).then(result => {
      if (result.isConfirmed) {
        this.sendApprove(id);
      }
    });
  }

  // ปฏิเสธจากปุ่มในตารางเท่านั้น
  rejectRequest(id: number, reqCode: string): void {
    Swal.fire({
      title: 'ปฏิเสธคำขอเข้าใช้งาน?',
      text: `ระบุเหตุผลในการปฏิเสธคำขอ [${reqCode}]`,
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
    }).then(result => {
      if (result.isConfirmed && result.value) {
        this.sendReject(id, result.value.trim());
      }
    });
  }

  // API อนุมัติเดิม
  private sendApprove(id: number): void {
    this.getAuthHeaders(headers => {
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
          }).then(() => this.loadPendingRequests());
        },
        error: (err) => {
          console.error('Approve Error:', err);

          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถอนุมัติรายการได้',
            icon: 'error'
          });
        }
      });
    });
  }

  // API ปฏิเสธเดิม
  private sendReject(id: number, rejectReason: string): void {
    this.getAuthHeaders(headers => {
      const jsonHeaders = headers.set(
        'Content-Type',
        'application/json'
      );

      this.http.post(
        `http://localhost:8080/api/v1/requests/${id}/reject`,
        { reject_reason: rejectReason },
        { headers: jsonHeaders }
      ).subscribe({
        next: () => {
          Swal.fire({
            title: 'สำเร็จ!',
            text: 'ปฏิเสธรายการเรียบร้อยแล้ว',
            icon: 'success',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#00a3e0'
          }).then(() => this.loadPendingRequests());
        },
        error: (err) => {
          console.error('Reject Error:', err);

          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถปฏิเสธรายการได้',
            icon: 'error'
          });
        }
      });
    });
  }
}
