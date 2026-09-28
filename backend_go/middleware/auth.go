package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type CustomClaims struct {
	Email       string   `json:"email"`
	Auth0Email  string   `json:"https://example.com/email"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

var jwks *keyfunc.JWKS

func InitJWKS(auth0Domain string) {
	domain := strings.TrimPrefix(auth0Domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")

	jwksURL := fmt.Sprintf("https://%s/.well-known/jwks.json", domain)
	options := keyfunc.Options{
		RefreshInterval: time.Hour,
	}

	var err error
	jwks, err = keyfunc.Get(jwksURL, options)
	if err != nil {
		fmt.Printf("❌ Error getting JWKS from Auth0 (%s): %v\n", jwksURL, err)
	} else {
		fmt.Println("✅ Successfully fetched JWKS from Auth0")
	}
}

func ValidateJWT(auth0Domain string, apiAudience string) gin.HandlerFunc {
	domain := strings.TrimPrefix(auth0Domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	expectedIssuer := fmt.Sprintf("https://%s/", domain)

	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Missing or invalid token"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &CustomClaims{}

		parseOptions := []jwt.ParserOption{
			jwt.WithIssuer(expectedIssuer),
			jwt.WithAudience(apiAudience),
		}

		var token *jwt.Token
		var err error

		if jwks != nil {
			token, err = jwt.ParseWithClaims(tokenString, claims, jwks.Keyfunc, parseOptions...)
		} else {
			token, _, err = jwt.NewParser(parseOptions...).ParseUnverified(tokenString, claims)
		}

		if err != nil || !token.Valid {
			fmt.Printf("⚠️ JWT Validation Error: %v\n", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Invalid or expired token"})
			c.Abort()
			return
		}

		userEmail := claims.Email
		if userEmail == "" {
			userEmail = claims.Auth0Email
		}
		if userEmail == "" {
			userEmail = c.GetHeader("X-User-Email")
		}

		c.Set("user", token)
		c.Set("user_id", claims.Subject)
		c.Set("user_email", userEmail)
		c.Set("permissions", claims.Permissions)

		c.Next()
	}
}

func RequirePermission(allowedPermissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userToken, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: No token provided"})
			c.Abort()
			return
		}

		token, ok := userToken.(*jwt.Token)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Invalid token format"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(*CustomClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Invalid token claims"})
			c.Abort()
			return
		}

		for _, userPerm := range claims.Permissions {
			for _, allowedPerm := range allowedPermissions {
				if userPerm == allowedPerm {
					c.Next()
					return
				}
			}
		}

		c.JSON(http.StatusForbidden, gin.H{
			"error": "Forbidden: You do not have permission to perform this action",
		})
		c.Abort()
	}
}
