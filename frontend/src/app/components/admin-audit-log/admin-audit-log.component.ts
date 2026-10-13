
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, of, combineLatest } from 'rxjs';

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule
  ],
  templateUrl: './admin-audit-log.component.html',
  styleUrls: ['./admin-audit-log.component.css']
})
export class AdminAuditLogComponent implements OnInit {
  rawAuditLogs: any[] = [];
  filteredLogs: any[] = [];
  pagedLogs: any[] = [];
  loading: boolean = false;

  // Modal States
  selectedLog: any = null;
  showModal: boolean = false;

  // Filter States
  searchTerm: string = '';
  readonly maxSearchLength: number = 150;

  selectedAction: string = 'ALL';
  startDate: string = '';
  endDate: string = '';

  // Pagination States
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 1;

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.fetchAuditLogs();
  }

  fetchAuditLogs(): void {
    this.loading = true;

    // ดึงทั้ง Access Token และ User Profile จาก Auth0 พร้อมกัน
    combineLatest([
      this.auth.getAccessTokenSilently().pipe(catchError(() => of(null))),
      this.auth.user$.pipe(catchError(() => of(null)))
    ]).subscribe(([token, user]) => {
      let headers = new HttpHeaders();

      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }

      // ส่ง X-User-Email ไปให้ Backend
      if (user && user.email) {
        headers = headers.set('X-User-Email', user.email);
      }

      // ดึงข้อมูลจาก Go Backend
      this.http.get<any[]>(
        'http://localhost:8080/api/v1/admin/audit-logs',
        { headers }
      ).pipe(
        catchError((err) => {
          console.error('API Error:', err);
          return of([]);
        })
      ).subscribe((res) => {
        if (res && res.length > 0) {
          this.rawAuditLogs = res.map(log => {
            const actor = log.actor_sub || '';

            // ดึง actor_email จาก DB และรองรับ Log เก่า
            let emailDisplay = log.actor_email || '';

            if (!emailDisplay) {
              if (['APPROVE', 'REJECT'].includes(log.action)) {
                emailDisplay = 'approver01@test.com';
              } else if (actor.includes('admin')) {
                emailDisplay = 'admin01@test.com';
              } else if (
                actor.includes('user02') ||
                actor.includes('8a12b44')
              ) {
                emailDisplay = 'user02@test.com';
              } else if (actor.includes('@')) {
                emailDisplay = actor;
              } else {
                emailDisplay = 'user01@test.com';
              }
            }

            // กำหนด Role Display
            let roleDisplay = 'User';

            if (['APPROVE', 'REJECT'].includes(log.action)) {
              roleDisplay = 'Approver';
            } else if (
              actor.includes('admin') ||
              emailDisplay.includes('admin')
            ) {
              roleDisplay = 'Admin';
            }

            // แปลงวันที่เป็น YYYY-MM-DD HH:mm:ss
            let formattedTimestamp = '';

            if (log.created_at) {
              const d = new Date(log.created_at);

              if (!isNaN(d.getTime())) {
                const pad = (n: number) => n < 10 ? '0' + n : n;

                formattedTimestamp =
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
              }
            }

            return {
              id: log.id,
              user_id: actor,
              email: emailDisplay,
              user: roleDisplay,
              action: log.action || 'ACTION',
              timestamp: formattedTimestamp,
              details: log.details || '-'
            };
          }).sort((a, b) => b.id - a.id);
        } else {
          this.rawAuditLogs = [];
        }

        this.applyFilter();
        this.loading = false;
      });
    });
  }

  // Modal Control Functions
  openDetailModal(log: any): void {
    this.selectedLog = log;
    this.showModal = true;
  }

  closeDetailModal(): void {
    this.showModal = false;
    this.selectedLog = null;
  }

  // ค้นหา Audit Log และใช้ตัวกรองร่วมกัน
  applyFilter(): void {
    const search = (this.searchTerm || '')
      .slice(0, this.maxSearchLength)
      .trim()
      .toLocaleLowerCase();

    this.filteredLogs = this.rawAuditLogs.filter(log => {
      // ฟิลด์ที่ค้นหาได้
      const searchableValues: unknown[] = [
        log.id,
        log.email,
        log.user,
        log.user_id,
        log.action,
        log.timestamp,
        log.details
      ];

      const matchesSearch =
        !search ||
        searchableValues.some(value =>
          String(value ?? '').toLocaleLowerCase().includes(search)
        );

      // กรองตาม Action
      const matchesAction =
        this.selectedAction === 'ALL' ||
        log.action === this.selectedAction;

      // เปรียบเทียบวันที่ในรูปแบบ YYYY-MM-DD
      const logDate = log.timestamp
        ? log.timestamp.substring(0, 10)
        : '';

      const matchesStart =
        !this.startDate ||
        (!!logDate && logDate >= this.startDate);

      const matchesEnd =
        !this.endDate ||
        (!!logDate && logDate <= this.endDate);

      return (
        matchesSearch &&
        matchesAction &&
        matchesStart &&
        matchesEnd
      );
    });

    // กลับไปหน้าแรกเมื่อเปลี่ยนตัวกรอง
    this.currentPage = 1;
    this.updatePagination();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedAction = 'ALL';
    this.startDate = '';
    this.endDate = '';
    this.applyFilter();
  }

  updatePagination(): void {
    this.totalPages =
      Math.ceil(this.filteredLogs.length / this.pageSize) || 1;

    const startIndex = (this.currentPage - 1) * this.pageSize;

    this.pagedLogs = this.filteredLogs.slice(
      startIndex,
      startIndex + this.pageSize
    );
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  get minItemCount(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredLogs.length
    );
  }

  getActionClass(action: string): string {
    switch (action) {
      case 'CREATE_DRAFT':
        return 'action-draft';
      case 'SUBMIT':
        return 'action-submit';
      case 'APPROVE':
        return 'action-approve';
      case 'REJECT':
        return 'action-reject';
      default:
        return 'action-default';
    }
  }

  exportToCSV(): void {
    if (!this.filteredLogs || this.filteredLogs.length === 0) {
      alert('ไม่มีข้อมูลสำหรับ Export');
      return;
    }

    // เรียงลำดับข้อมูลใน CSV จาก ID น้อยไปมาก
    const sortedLogs = [...this.filteredLogs].sort(
      (a, b) => a.id - b.id
    );

    const headers = [
      'ID',
      'Email',
      'User',
      'Action',
      'Timestamp',
      'Details'
    ];

    // แปลงข้อมูลแต่ละรายการเป็น CSV Row
    const csvRows = sortedLogs.map(log => {
      const cleanDetails =
        `"${(log.details || '').replace(/"/g, '""')}"`;
      const cleanEmail = `"${log.email || ''}"`;
      const cleanUser = `"${log.user || ''}"`;
      const cleanAction = `"${log.action || ''}"`;
      const cleanTimestamp = `"${log.timestamp || ''}"`;

      return [
        log.id,
        cleanEmail,
        cleanUser,
        cleanAction,
        cleanTimestamp,
        cleanDetails
      ].join(',');
    });

    // เพิ่ม UTF-8 BOM เพื่อรองรับภาษาไทยใน Excel
    const csvContent =
      '\uFEFF' + [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob(
      [csvContent],
      { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const today = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `audit_log_${today}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
}
