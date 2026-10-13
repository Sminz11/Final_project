
import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { RequestService, RequestItem } from '../services/request.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  myRequests: RequestItem[] = [];
  filteredRequests: RequestItem[] = [];

  searchTerm = '';
  readonly maxSearchLength = 150;

  selectedStatus = 'ALL';
  loadingRequests = false;

  // Modal รายละเอียดคำขอ
  selectedDetail: RequestItem | null = null;
  showDetailModal = false;

  // Pagination
  currentPage = 1;
  pageSize = 5;
  Math = Math;

  constructor(
    private requestService: RequestService,
    private router: Router,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.auth.isAuthenticated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthenticated: boolean) => {
        if (isAuthenticated) {
          this.loadMyRequests();
        }
      });
  }

  login(): void {
    this.auth.loginWithRedirect();
  }

  // โหลดรายการคำขอของผู้ใช้
  loadMyRequests(): void {
    this.loadingRequests = true;

    this.requestService.getMyRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: RequestItem[]) => {
          this.myRequests = (data || []).map((item: RequestItem) => {
            const raw = item as unknown as Record<string, any>;

            return {
              ...item,
              req_code: item.req_code || raw['reqCode'] || String(item.id),
              request_type: item.request_type || raw['requestType'],
              target_system: item.target_system || raw['targetSystem'],
              status: item.status || 'DRAFT'
            };
          });

          this.applyFilter();
          this.loadingRequests = false;
        },
        error: (err: unknown) => {
          console.error('Fetch requests error:', err);
          this.loadingRequests = false;

          Swal.fire({
            title: 'โหลดข้อมูลไม่สำเร็จ',
            text: 'ไม่สามารถโหลดรายการคำขอได้ กรุณาลองใหม่อีกครั้ง',
            icon: 'error',
            confirmButtonText: 'ตกลง'
          });
        }
      });
  }

  // ค้นหาข้อมูลคำขอและกรองตามสถานะ
  applyFilter(): void {
    const term = (this.searchTerm || '')
      .slice(0, this.maxSearchLength)
      .trim()
      .toLocaleLowerCase();

    this.filteredRequests = this.myRequests.filter((req: RequestItem) => {
      const raw = req as unknown as Record<string, unknown>;

      const searchableValues: unknown[] = [
        req.id,
        req.req_code,
        req.title,
        req.request_type,
        req.target_system,
        req.status,
        req.reason,
        req.reject_reason,
        raw['reqCode'],
        raw['requestType'],
        raw['targetSystem'],
        raw['requester_email'],
        raw['requesterEmail'],
        raw['created_at'],
        raw['createdAt'],
        raw['submitted_at'],
        raw['submittedAt'],
        raw['approved_at'],
        raw['approvedAt']
      ];

      // รองรับการค้นหาจากฟิลด์อื่นที่ API ส่งกลับมา
      Object.values(raw).forEach((value: unknown) => {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          searchableValues.push(value);
        }
      });

      const matchSearch =
        !term ||
        searchableValues.some((value: unknown) =>
          String(value ?? '').toLocaleLowerCase().includes(term)
        );

      const matchStatus =
        this.selectedStatus === 'ALL' ||
        req.status === this.selectedStatus;

      return matchSearch && matchStatus;
    });

    // เมื่อค้นหาหรือเปลี่ยนตัวกรอง ให้กลับไปหน้าแรก
    this.currentPage = 1;
  }

  // เปิดหน้าแก้ไขคำขอ โดยส่ง ID ผ่าน query parameter
  editDraft(req: RequestItem): void {
    if (req.status !== 'DRAFT') {
      return;
    }

    this.router.navigate(['/create-request'], {
      queryParams: { id: req.id }
    });
  }

  // เปิด Modal รายละเอียด
  openDetailModal(item: RequestItem): void {
    this.selectedDetail = item;
    this.showDetailModal = true;
  }

  // ปิด Modal รายละเอียด
  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedDetail = null;
  }

  // ข้อมูลเฉพาะหน้าปัจจุบัน
  get pagedRequests(): RequestItem[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;

    return this.filteredRequests.slice(
      startIndex,
      startIndex + this.pageSize
    );
  }

  // จำนวนหน้าทั้งหมด
  get totalPages(): number {
    return Math.ceil(this.filteredRequests.length / this.pageSize) || 1;
  }

  // เปลี่ยนหน้า
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  // สีตามสถานะ
  getStatusStyle(status: string): { [key: string]: string } {
    switch (status) {
      case 'DRAFT':
        return {
          'background-color': '#f1f5f9',
          'color': '#475569'
        };

      case 'SUBMITTED':
        return {
          'background-color': '#e0f2fe',
          'color': '#0288d1'
        };

      case 'APPROVED':
        return {
          'background-color': '#dcfce7',
          'color': '#15803d'
        };

      case 'REJECTED':
        return {
          'background-color': '#fee2e2',
          'color': '#b91c1c'
        };

      default:
        return {
          'background-color': '#f1f5f9',
          'color': '#475569'
        };
    }
  }

  // ยืนยันก่อนส่งคำขอ
  submitRequest(requestId: number): void {
    Swal.fire({
      title: 'ยืนยันการส่งคำขอ?',
      text: 'คุณต้องการส่งคำขอนี้เพื่อขออนุมัติใช่หรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ใช่, ส่งคำขอเลย!',
      cancelButtonText: 'ยกเลิก',
      customClass: { popup: 'swal-ktb-popup' }
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeSubmit(requestId);
      }
    });
  }

  // เรียก API ส่งคำขอ
  private executeSubmit(requestId: number): void {
    this.requestService.submitRequest(requestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          Swal.fire({
            title: 'ส่งคำขอสำเร็จ!',
            text: 'รายการคำขอของคุณถูกส่งไปยังผู้อนุมัติเรียบร้อยแล้ว',
            icon: 'success',
            confirmButtonColor: '#00a3e0',
            confirmButtonText: 'ตกลง',
            customClass: { popup: 'swal-ktb-popup' }
          });

          this.loadMyRequests();
        },
        error: (err: any) => {
          console.error('Submit error:', err);

          Swal.fire({
            title: 'เกิดข้อผิดพลาด!',
            text:
              err.error?.error ||
              err.error?.message ||
              'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่อีกครั้ง',
            icon: 'error',
            confirmButtonColor: '#ef4444',
            customClass: { popup: 'swal-ktb-popup' }
          });
        }
      });
  }
}
