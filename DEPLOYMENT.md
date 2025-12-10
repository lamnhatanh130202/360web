# 🚀 HƯỚNG DẪN DEPLOY WEB LÊN SERVER

Hướng dẫn chi tiết để deploy ứng dụng 360 Virtual Tour lên các platform khác nhau.

---

## 📋 CHUẨN BỊ TRƯỚC KHI DEPLOY

### 1. Build Frontend và CMS

```bash
# Build Frontend
cd frontend
pnpm install
pnpm build

# Build CMS Frontend  
cd ../cms-frontend
pnpm install
pnpm build
```

### 2. Kiểm tra các file cần thiết

- ✅ `backend/keys/google-tts-key.json` (nếu dùng TTS)
- ✅ `cms/data/scenes.json`
- ✅ `cms/data/tours.json`
- ✅ `cms/data/graph.json`

---

## 🌐 CÁCH 1: DEPLOY LÊN VPS/SERVER (KHUYẾN NGHỊ)

### Yêu cầu:
- VPS/Server có cài Docker & Docker Compose
- Domain name (tùy chọn, có thể dùng IP)
- SSH access

### Bước 1: Clone code từ GitHub

```bash
# SSH vào server
ssh user@your-server-ip

# Clone repository
git clone https://github.com/your-username/360web.git
cd 360web
```

### Bước 2: Cấu hình môi trường

```bash
# Tạo file .env (nếu cần)
# Chỉnh sửa docker-compose.yml nếu cần thay đổi ports
```

### Bước 3: Build và chạy

```bash
# Build images
docker-compose build

# Chạy ở background
docker-compose up -d

# Xem logs
docker-compose logs -f
```

### Bước 4: Setup Nginx Reverse Proxy (Tùy chọn)

Tạo file `/etc/nginx/sites-available/360web`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # CMS
    location /cms {
        proxy_pass http://localhost:8080/cms;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Kích hoạt:
```bash
sudo ln -s /etc/nginx/sites-available/360web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 5: Setup SSL với Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## ☁️ CÁCH 2: DEPLOY LÊN RAILWAY

Railway hỗ trợ Docker và dễ deploy.

### Bước 1: Tạo tài khoản Railway

1. Truy cập: https://railway.app
2. Đăng nhập bằng GitHub
3. Tạo project mới

### Bước 2: Deploy Backend

1. Click "New" → "GitHub Repo"
2. Chọn repository của bạn
3. Railway sẽ tự detect Dockerfile
4. Set environment variables:
   - `FLASK_ENV=production`
   - `FLASK_DEBUG=0`
   - `GOOGLE_APPLICATION_CREDENTIALS=/app/backend/keys/google-tts-key.json`
5. Add file `google-tts-key.json` vào Secrets nếu cần

### Bước 3: Deploy Frontend

1. Tạo service mới cho frontend
2. Chọn "Dockerfile" từ `frontend/Dockerfile`
3. Set build context: `./frontend`
4. Railway sẽ tự động build và deploy

### Bước 4: Cấu hình Domain

1. Vào Settings của mỗi service
2. Click "Generate Domain" hoặc add custom domain
3. Railway sẽ tự động setup HTTPS

---

## 🌊 CÁCH 3: DEPLOY LÊN RENDER

Render cũng hỗ trợ Docker tốt.

### Bước 1: Tạo tài khoản Render

1. Truy cập: https://render.com
2. Đăng nhập bằng GitHub
3. Tạo "New Web Service"

### Bước 2: Deploy Backend

1. Connect GitHub repository
2. Chọn:
   - **Name**: `360web-backend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Root Directory**: `backend`
3. Set environment variables
4. Click "Create Web Service"

### Bước 3: Deploy Frontend

1. Tạo service mới
2. Chọn:
   - **Name**: `360web-frontend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `frontend/Dockerfile`
   - **Root Directory**: `frontend`
3. Set environment variable:
   - `REACT_APP_API_URL`: URL của backend service
4. Click "Create Web Service"

### Bước 4: Setup Custom Domain

1. Vào Settings của mỗi service
2. Add custom domain
3. Render tự động setup SSL

---

## 🐳 CÁCH 4: DEPLOY LÊN DIGITALOCEAN APP PLATFORM

### Bước 1: Tạo App trên DigitalOcean

1. Truy cập: https://cloud.digitalocean.com/apps
2. Click "Create App"
3. Connect GitHub repository

### Bước 2: Cấu hình Services

**Backend Service:**
- Type: `Web Service`
- Source: `backend/`
- Dockerfile: `backend/Dockerfile`
- Port: `5000`

**Frontend Service:**
- Type: `Web Service`
- Source: `frontend/`
- Dockerfile: `frontend/Dockerfile`
- Port: `80`

### Bước 3: Deploy

DigitalOcean sẽ tự động build và deploy khi có commit mới.

---

## 🔧 CÁCH 5: DEPLOY LÊN VERCEL (Frontend) + RAILWAY (Backend)

### Deploy Backend lên Railway

Theo hướng dẫn ở Cách 2.

### Deploy Frontend lên Vercel

1. Truy cập: https://vercel.com
2. Import GitHub repository
3. Cấu hình:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`
4. Set environment variable:
   - `VITE_API_URL`: URL của backend (Railway)
5. Deploy

**Lưu ý**: Vercel chỉ deploy frontend, cần backend riêng.

---

## 📝 CHECKLIST TRƯỚC KHI DEPLOY

- [ ] Đã build frontend và CMS (`pnpm build`)
- [ ] Đã test local với Docker Compose
- [ ] Đã set environment variables đúng
- [ ] Đã upload file `google-tts-key.json` (nếu cần)
- [ ] Đã cấu hình CORS trong backend (nếu cần)
- [ ] Đã setup domain và SSL
- [ ] Đã backup database/files (nếu có)

---

## 🔒 BẢO MẬT PRODUCTION

### 1. Environment Variables

Không commit các file sensitive:
- `.env`
- `google-tts-key.json`
- `secrets.json`

Sử dụng Secrets Management của platform:
- Railway: Secrets tab
- Render: Environment variables
- Vercel: Environment variables

### 2. CORS Configuration

Trong `backend/app.py`, cấu hình CORS:

```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://your-domain.com", "https://www.your-domain.com"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

### 3. Rate Limiting

Thêm rate limiting cho API:

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)
```

### 4. HTTPS/SSL

Luôn sử dụng HTTPS trong production:
- Railway, Render, Vercel tự động có SSL
- VPS: Dùng Let's Encrypt (certbot)

---

## 🐛 TROUBLESHOOTING

### Lỗi: Build failed

```bash
# Kiểm tra logs
docker-compose logs backend
docker-compose logs frontend

# Rebuild
docker-compose build --no-cache
```

### Lỗi: CORS error

- Kiểm tra CORS settings trong backend
- Đảm bảo frontend URL được thêm vào allowed origins

### Lỗi: 404 Not Found

- Kiểm tra nginx configuration
- Kiểm tra proxy settings
- Kiểm tra routes trong backend

### Lỗi: Database/File not found

- Kiểm tra volumes được mount đúng
- Kiểm tra file permissions
- Kiểm tra paths trong code

---

## 📊 MONITORING

### Health Check

Backend có endpoint `/health` để check:

```bash
curl https://your-backend-url.com/health
```

### Logs

**Docker:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Railway/Render:**
- Xem logs trong dashboard
- Hoặc dùng CLI: `railway logs`

---

## 🔄 CI/CD TỰ ĐỘNG

### GitHub Actions (Tùy chọn)

Tạo `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /path/to/360web
            git pull
            docker-compose build
            docker-compose up -d
```

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề:
1. Kiểm tra logs của services
2. Kiểm tra environment variables
3. Kiểm tra network/ports
4. Kiểm tra file permissions

---

**Chúc bạn deploy thành công! 🎉**

