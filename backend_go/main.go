package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"intern-backend/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Request struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	ReqCode        string     `gorm:"uniqueIndex;not null" json:"req_code"`
	UserID         string     `gorm:"not null;index" json:"user_id"` // requester_sub จาก JWT sub
	RequesterEmail string     `json:"requester_email"`
	Title          string     `gorm:"not null" json:"title"`
	RequestType    string     `gorm:"not null" json:"request_type"`
	TargetSystem   string     `gorm:"not null" json:"target_system"`
	Reason         string     `gorm:"not null" json:"reason"`
	Status         string     `gorm:"default:'DRAFT'" json:"status"`
	ApprovedBySub  string     `json:"approved_by_sub,omitempty"`
	RejectReason   string     `json:"reject_reason,omitempty"`
	SubmittedAt    *time.Time `json:"submitted_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AuditLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ActorSub        string    `gorm:"not null" json:"actor_sub"`
	ActorEmail      string    `json:"actor_email"`
	Action          string    `gorm:"not null" json:"action"`
	TargetRequestID uint      `gorm:"not null" json:"target_request_id"`
	Details         string    `json:"details"`
	CreatedAt       time.Time `json:"created_at"`
}

type CreateRequestInput struct {
	Title        string `json:"title" binding:"required"`
	RequestType  string `json:"request_type" binding:"required"`
	TargetSystem string `json:"target_system" binding:"required"`
	Reason       string `json:"reason" binding:"required"`
}

type UpdateRequestInput struct {
	Title        string `json:"title"`
	RequestType  string `json:"request_type"`
	TargetSystem string `json:"target_system"`
	Reason       string `json:"reason"`
}

type RejectInput struct {
	RejectReason string `json:"reject_reason" binding:"required"`
}

var DB *gorm.DB

func initDB() {
	dsn := "host=localhost user=postgres password=1234 dbname=final_db port=1234 sslmode=disable TimeZone=Asia/Bangkok"
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("ไม่สามารถเชื่อมต่อ PostgreSQL ได้: %v", err)
	}
	database.AutoMigrate(&Request{}, &AuditLog{})
	DB = database
	log.Println("เชื่อมต่อ PostgreSQL เรียบร้อยแล้ว!")
}

func logAudit(actorSub string, actorEmail string, action string, requestID uint, details string) {
	DB.Create(&AuditLog{
		ActorSub:        actorSub,
		ActorEmail:      actorEmail,
		Action:          action,
		TargetRequestID: requestID,
		Details:         details,
		CreatedAt:       time.Now(),
	})
}

// Handlers

func createRequestHandler(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งานจาก Token"})
		return
	}
	userID := userIDVal.(string)

	userEmail := ""
	if emailVal, ok := c.Get("user_email"); ok {
		if emailStr, ok := emailVal.(string); ok {
			userEmail = emailStr
		}
	}

	var input CreateRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือกรอกข้อมูลไม่ครบถ้วน"})
		return
	}

	var count int64
	DB.Model(&Request{}).Count(&count)

	newReq := Request{
		ReqCode:        fmt.Sprintf("REQ-2026-%06d", count+1),
		UserID:         userID,
		RequesterEmail: userEmail,
		Title:          input.Title,
		RequestType:    input.RequestType,
		TargetSystem:   input.TargetSystem,
		Reason:         input.Reason,
		Status:         "DRAFT",
	}

	if err := DB.Create(&newReq).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้"})
		return
	}

	logAudit(userID, userEmail, "CREATE_DRAFT", newReq.ID, fmt.Sprintf("Created draft request %s", newReq.ReqCode))
	c.JSON(http.StatusCreated, newReq)
}

func updateDraftHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(string)
	userEmail, _ := c.Get("user_email")
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์แก้ไขคำขอของผู้อื่น"})
		return
	}
	if req.Status != "DRAFT" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "แก้ไขได้เฉพาะคำขอที่เป็น DRAFT เท่านั้น"})
		return
	}

	var input UpdateRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if input.Title != "" {
		req.Title = input.Title
	}
	if input.RequestType != "" {
		req.RequestType = input.RequestType
	}
	if input.TargetSystem != "" {
		req.TargetSystem = input.TargetSystem
	}
	if input.Reason != "" {
		req.Reason = input.Reason
	}

	DB.Save(&req)
	logAudit(userID, fmt.Sprint(userEmail), "UPDATE_DRAFT", req.ID, fmt.Sprintf("Updated draft request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func submitRequestHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(string)
	userEmail, _ := c.Get("user_email")
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ Submit คำขอของผู้อื่น"})
		return
	}
	if req.Status != "DRAFT" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "คำขอนี้ไม่ได้อยู่ในสถานะ DRAFT"})
		return
	}

	now := time.Now()
	req.Status = "SUBMITTED"
	req.SubmittedAt = &now
	DB.Save(&req)

	logAudit(userID, fmt.Sprint(userEmail), "SUBMIT", req.ID, fmt.Sprintf("Submitted request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func getMyRequestsHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(string)
	var requests []Request
	DB.Where("user_id = ?", userID).Order("created_at desc").Find(&requests)
	c.JSON(http.StatusOK, requests)
}

func getPendingRequestsHandler(c *gin.Context) {
	var requests []Request
	DB.Where("status = ?", "SUBMITTED").Order("created_at desc").Find(&requests)
	c.JSON(http.StatusOK, requests)
}

func approveRequestHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(string)
	userEmail, _ := c.Get("user_email")
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.Status != "SUBMITTED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "อนุมัติได้เฉพาะคำขอที่อยู่ในสถานะ SUBMITTED"})
		return
	}

	req.Status = "APPROVED"
	req.ApprovedBySub = userID
	DB.Save(&req)

	logAudit(userID, fmt.Sprint(userEmail), "APPROVE", req.ID, fmt.Sprintf("Approved request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func rejectRequestHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(string)
	userEmail, _ := c.Get("user_email")
	id := c.Param("id")

	var input RejectInput
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.RejectReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reject_reason is required"})
		return
	}

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.Status != "SUBMITTED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปฏิเสธได้เฉพาะคำขอที่อยู่ในสถานะ SUBMITTED"})
		return
	}

	req.Status = "REJECTED"
	req.RejectReason = input.RejectReason
	req.ApprovedBySub = userID
	DB.Save(&req)

	logAudit(userID, fmt.Sprint(userEmail), "REJECT", req.ID, fmt.Sprintf("Rejected request %s: %s", req.ReqCode, input.RejectReason))
	c.JSON(http.StatusOK, req)
}

func getAllRequestsAdminHandler(c *gin.Context) {
	var requests []Request
	DB.Order("created_at desc").Find(&requests)
	c.JSON(http.StatusOK, requests)
}

func getAuditLogsHandler(c *gin.Context) {
	var logs []AuditLog
	DB.Order("created_at desc").Find(&logs)
	c.JSON(http.StatusOK, logs)
}

func main() {
	initDB()

	auth0Domain := "dev-if4shgdd8fo8fttw.us.auth0.com"
	apiAudience := "https://intern-request-api"
	middleware.InitJWKS(auth0Domain)

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:4200")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Email")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	v1 := r.Group("/api/v1")
	v1.Use(middleware.ValidateJWT(auth0Domain, apiAudience))
	{
		v1.GET("/protected", func(c *gin.Context) {
			userID, _ := c.Get("user_id")
			c.JSON(http.StatusCreated, gin.H{
				"message": "เชื่อมต่อ Backend API สำเร็จ",
				"status":  "success",
				"user_id": userID,
			})
		})

		// REQUEST_USER Endpoints
		v1.POST("/requests", middleware.RequirePermission("create:requests"), createRequestHandler)
		v1.PUT("/requests/:id", middleware.RequirePermission("create:requests"), updateDraftHandler)
		v1.POST("/requests/:id/submit", middleware.RequirePermission("create:requests"), submitRequestHandler)
		v1.GET("/requests", getMyRequestsHandler)

		// REQUEST_APPROVER Endpoints
		v1.GET("/approvals/pending", middleware.RequirePermission("read:pending_requests"), getPendingRequestsHandler)
		v1.POST("/requests/:id/approve", middleware.RequirePermission("approve:requests"), approveRequestHandler)
		v1.POST("/requests/:id/reject", middleware.RequirePermission("approve:requests"), rejectRequestHandler)

		// REQUEST_ADMIN Endpoints
		v1.GET("/admin/requests", middleware.RequirePermission("read:all_requests"), getAllRequestsAdminHandler)
		v1.GET("/admin/audit-logs", middleware.RequirePermission("read:audit_logs"), getAuditLogsHandler)
		v1.GET("/admin/audit-log", middleware.RequirePermission("read:audit_logs"), getAuditLogsHandler)
	}

	log.Println("Backend Server running on port 8080")
	r.Run(":8080")
}
