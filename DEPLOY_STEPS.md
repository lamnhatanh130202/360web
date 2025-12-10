# 🚀 CÁC BƯỚC DEPLOY SAU KHI PUSH LÊN GITHUB

Hướng dẫn từng bước để deploy ứng dụng sau khi đã push code lên GitHub.

---

## 📍 TÌNH HUỐNG 1: DEPLOY LÊN VPS/SERVER CỦA BẠN

### Bước 1: SSH vào server

```bash
ssh user@your-server-ip
# Ví dụ: ssh root@123.45.67.89
```

### Bước 2: Clone hoặc pull code mới

**Nếu chưa clone:**
```bash
git clone https://github.com/your-username/360web.git
cd 360web
```

**Nếu đã có code:**
```bash
cd 360web
git pull origin main
```

### Bước 3: Copy file cấu hình (lần đầu tiên)

```bash
# Copy file env.example thành .env
cp env.example .env

# Chỉnh sửa .env
nano .env
# Hoặc: vi .env
```

**Quan trọng:** Thay đổi các giá trị sau trong `.env`:
- `AUTH_SECRET_KEY` - Dùng chuỗi ngẫu nhiên (ví dụ: `openssl rand -hex 32`)
- `ADMIN_PASSWORD` - Đặt mật khẩu mạnh cho admin

### Bước 4: Đảm bảo có các file cần thiết

```bash
# Kiểm tra các file
ls -la backend/keys/google-tts-key.json  # (nếu dùng TTS)
ls -la cms/data/scenes.json
ls -la cms/data/tours.json
ls -la cms/data/graph.json
```

### Bước 5: Build và deploy

```bash
# Cấp quyền cho scripts
chmod +x build.sh deploy.sh

# Build frontend và CMS
./build.sh

# Deploy
./deploy.sh
```

### Bước 6: Kiểm tra

```bash
# Xem logs
docker-compose -f docker-compose.prod.yml logs -f

# Xem status
docker-compose -f docker-compose.prod.yml ps

# Test backend
curl http://localhost:5000/health
```

**Truy cập:**
- Frontend: http://your-server-ip:8080
- CMS: http://your-server-ip:8080/cms

---

## ☁️ TÌNH HUỐNG 2: DEPLOY LÊN RAILWAY (Dễ nhất)

### Bước 1: Tạo tài khoản Railway

1. Truy cập: https://railway.app
2. Đăng nhập bằng GitHub
3. Click "New Project"

### Bước 2: Deploy Backend

1. Click "New" → "GitHub Repo"
2. Chọn repository `360web`
3. Railway sẽ tự detect Dockerfile
4. **Quan trọng:** Set Root Directory: `backend`
5. Set environment variables:
   ```
   FLASK_ENV=production
   FLASK_DEBUG=0
   AUTH_SECRET_KEY=your_random_secret_key
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_password
   ```
6. Railway sẽ tự động build và deploy

### Bước 3: Deploy Frontend

1. Tạo service mới trong cùng project
2. Click "New" → "GitHub Repo" → Chọn lại repo `360web`
3. Set Root Directory: `frontend`
4. Railway sẽ tự động build và deploy

### Bước 4: Cấu hình Domain

1. Vào Settings của mỗi service
2. Click "Generate Domain" để có URL miễn phí
3. Hoặc add custom domain của bạn
4. Railway tự động setup HTTPS

**Kết quả:**
- Backend: https://your-backend.railway.app
- Frontend: https://your-frontend.railway.app

---

## 🌊 TÌNH HUỐNG 3: DEPLOY LÊN RENDER

### Bước 1: Tạo tài khoản Render

1. Truy cập: https://render.com
2. Đăng nhập bằng GitHub
3. Click "New +" → "Web Service"

### Bước 2: Deploy Backend

1. Connect GitHub repository: `360web`
2. Cấu hình:
   - **Name**: `360web-backend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Root Directory**: `backend`
3. Set environment variables (giống Railway)
4. Click "Create Web Service"

### Bước 3: Deploy Frontend

1. Tạo service mới
2. Connect cùng repository
3. Cấu hình:
   - **Name**: `360web-frontend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `frontend/Dockerfile`
   - **Root Directory**: `frontend`
4. Set environment variable:
   - `REACT_APP_API_URL`: URL của backend service
5. Click "Create Web Service"

### Bước 4: Setup Custom Domain

1. Vào Settings của mỗi service
2. Add custom domain
3. Render tự động setup SSL

---

## 🔄 UPDATE CODE SAU KHI ĐÃ DEPLOY

### Trên VPS/Server:

```bash
# SSH vào server
ssh user@your-server-ip
cd 360web

# Pull code mới
git pull origin main

# Rebuild và restart
./build.sh
docker-compose -f docker-compose.prod.yml up -d --build

# Kiểm tra
docker-compose -f docker-compose.prod.yml logs -f
```

### Trên Railway/Render:

**Tự động!** Khi bạn push code lên GitHub, Railway/Render sẽ tự động:
1. Detect changes
2. Rebuild images
3. Deploy lại

Bạn chỉ cần push code:
```bash
git add .
git commit -m "Update code"
git push origin main
```

---

## 🔧 TROUBLESHOOTING

### Lỗi: Build failed trên server

```bash
# Xem logs chi tiết
docker-compose -f docker-compose.prod.yml logs backend

# Rebuild không cache
docker-compose -f docker-compose.prod.yml build --no-cache backend

# Xóa images cũ
docker system prune -a
```

### Lỗi: Port đã được sử dụng

```bash
# Tìm process đang dùng port
sudo lsof -i :8080
sudo lsof -i :5000

# Kill process
sudo kill -9 <PID>

# Hoặc đổi port trong .env
nano .env
# Sửa: BACKEND_PORT=5001, FRONTEND_PORT=8081
```

### Lỗi: Permission denied

```bash
# Thêm quyền cho scripts
chmod +x build.sh deploy.sh

# Kiểm tra quyền Docker
sudo usermod -aG docker $USER
# Logout và login lại
```

### Lỗi: Frontend không kết nối được Backend

1. Kiểm tra backend đang chạy:
   ```bash
   curl http://localhost:5000/health
   ```

2. Kiểm tra CORS trong `backend/app.py`
3. Kiểm tra API URL trong frontend code

---

## ✅ CHECKLIST DEPLOY

- [ ] Đã push code lên GitHub
- [ ] Đã SSH vào server (nếu deploy VPS)
- [ ] Đã clone/pull code mới
- [ ] Đã copy `env.example` thành `.env`
- [ ] Đã thay đổi `AUTH_SECRET_KEY` và `ADMIN_PASSWORD`
- [ ] Đã có file `google-tts-key.json` (nếu cần)
- [ ] Đã chạy `./build.sh` hoặc script build
- [ ] Đã chạy `./deploy.sh` hoặc `docker-compose up -d`
- [ ] Đã kiểm tra logs không có lỗi
- [ ] Đã truy cập được frontend và CMS
- [ ] Đã test các chức năng chính

---

## 🎯 TÓM TẮT NHANH

**VPS/Server:**
```bash
ssh user@server
cd 360web
git pull
cp env.example .env  # (lần đầu)
nano .env  # Sửa AUTH_SECRET_KEY và ADMIN_PASSWORD
chmod +x build.sh deploy.sh
./build.sh
./deploy.sh
```

**Railway/Render:**
1. Connect GitHub repo
2. Set environment variables
3. Deploy tự động!

---

**Chúc bạn deploy thành công! 🎉**

