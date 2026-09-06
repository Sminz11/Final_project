import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, of } from 'rxjs';

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

    this.auth.getAccessTokenSilently().pipe(
      catchError(() => of(null))
    ).subscribe((token) => {
      const headers = token ? new HttpHeaders({ 'Authorization': `Bearer ${token}` }) : new HttpHeaders();

      // ดึงข้อมูลจาก Go Backend Endpoint: /api/v1/admin/audit-logs
      this.http.get<any[]>('http://localhost:8080/api/v1/admin/audit-logs', { headers }).pipe(
        catchError((err) => {
          console.error('API Error:', err);
          return of([]);
        })
      ).subscribe((res) => {
        if (res && res.length > 0) {
          this.rawAuditLogs = res.map(log => {
            const actor = log.actor_sub || '';

            // 1. ดึง actor_email จาก DB ตรงๆ ( fallback ไปยังวิธี Map เดิมหากเป็น log เก่าที่ actor_email เป็นค่าว่าง )
            let emailDisplay = log.actor_email || '';

            // Fallback รองรับ Log ข้อมูลชุดเก่า
            if (!emailDisplay) {
              if (['APPROVE', 'REJECT'].includes(log.action)) {
                emailDisplay = 'approver01@test.com';
              } else if (actor.includes('admin')) {
                emailDisplay = 'admin01@test.com';
              } else if (actor.includes('user02') || actor.includes('8a12b44')) {
                emailDisplay = 'user02@test.com';
              } else if (actor.includes('@')) {
                emailDisplay = actor;
              } else {
                emailDisplay = 'user01@test.com';
              }
            }

            // 2. กำหนด Role Display ให้สวยงาม
            let roleDisplay = 'User';
            if (['APPROVE', 'REJECT'].includes(log.action)) {
              roleDisplay = 'Approver';
            } else if (actor.includes('admin') || emailDisplay.includes('admin')) {
              roleDisplay = 'Admin';
            }

            // 3. จัดการแปลงวันที่ให้อยู่ในฟอร์แมต YYYY-MM-DD HH:mm:ss อย่างปลอดภัย
            let formattedTimestamp = '';
            if (log.created_at) {
              const d = new Date(log.created_at);
              if (!isNaN(d.getTime())) {
                const pad = (n: number) => n < 10 ? '0' + n : n;
                formattedTimestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
          }).sort((a, b) => b.id - a.id); // เรียงรายการล่าสุดขึ้นก่อน (ID มากไปน้อย)
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

  applyFilter(): void {
    this.filteredLogs = this.rawAuditLogs.filter(log => {
      const search = this.searchTerm.trim().toLowerCase();
      const matchesSearch = !search || 
        (log.email && log.email.toLowerCase().includes(search)) ||
        (log.user_id && log.user_id.toLowerCase().includes(search)) ||
        (log.details && log.details.toLowerCase().includes(search));

      const matchesAction = this.selectedAction === 'ALL' || log.action === this.selectedAction;

      // สกัดเฉพาะ YYYY-MM-DD เพื่อเอามาเปรียบเทียบกับ Date Picker
      const logDate = log.timestamp ? log.timestamp.substring(0, 10) : '';
      const matchesStart = !this.startDate || (logDate && logDate >= this.startDate);
      const matchesEnd = !this.endDate || (logDate && logDate <= this.endDate);

      return matchesSearch && matchesAction && matchesStart && matchesEnd;
    });

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
    this.totalPages = Math.ceil(this.filteredLogs.length / this.pageSize) || 1;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.pagedLogs = this.filteredLogs.slice(startIndex, startIndex + this.pageSize);
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  get minItemCount(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredLogs.length);
  }

  getActionClass(action: string): string {
    switch (action) {
      case 'CREATE_DRAFT': return 'action-draft';
      case 'SUBMIT': return 'action-submit';
      case 'APPROVE': return 'action-approve';
      case 'REJECT': return 'action-reject';
      default: return 'action-default';
    }
  }

  exportToCSV(): void {
    if (!this.filteredLogs || this.filteredLogs.length === 0) {
      alert('ไม่มีข้อมูลสำหรับ Export');
      return;
    }

    const headers = ['ID', 'Auth ID', 'Email', 'User', 'Action', 'Timestamp', 'Details'];
    const csvRows = [headers.join(',')];

    for (const log of this.filteredLogs) {
      const row = [
        log.id || '',
        `"${log.user_id || ''}"`,
        `"${log.email || ''}"`,
        `"${log.user || ''}"`,
        `"${log.action || ''}"`,
        `"${log.timestamp || ''}"`,
        `"${log.details || ''}"`
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}