from locust import HttpUser, task, between
import random
import json

class Web360User(HttpUser):
    """
    Locust User class để test hệ thống Web 360
    Giả lập hành vi người dùng thực tế khi sử dụng ứng dụng
    """
    # Host mặc định - Backend API chạy trên Docker
    host = "http://localhost:5000"
    
    # Thời gian nghỉ giữa các thao tác (giả lập người dùng thật đang xem ảnh)
    # Nghỉ từ 1 đến 5 giây giữa các request
    wait_time = between(1, 5)
    
    # Cache để lưu scene IDs và graph data
    scene_ids = []
    graph_data = None
    
    def on_start(self):
        """Chạy một lần khi user bắt đầu session"""
        # Lấy danh sách scenes để cache scene IDs
        response = self.client.get("/api/scenes")
        if response.status_code == 200:
            scenes = response.json()
            self.scene_ids = [s.get('id') for s in scenes if s.get('id')]
            print(f"[Locust] Loaded {len(self.scene_ids)} scene IDs")
        
        # Lấy graph data để test pathfinding
        response = self.client.get("/api/graph")
        if response.status_code == 200:
            self.graph_data = response.json()
            print(f"[Locust] Loaded graph data")
    
    @task(10)  # Trọng số 10: Hành động này diễn ra nhiều nhất
    def get_all_scenes(self):
        """Giả lập lấy danh sách Scene để hiển thị menu"""
        with self.client.get("/api/scenes", catch_response=True) as response:
            if response.status_code == 200:
                scenes = response.json()
                if len(scenes) > 0:
                    response.success()
                else:
                    response.failure("No scenes returned")
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(8)  # Trọng số 8: Thường xuyên tải graph
    def get_minimap_data(self):
        """Giả lập tải dữ liệu bản đồ minimap"""
        with self.client.get("/api/graph", catch_response=True) as response:
            if response.status_code == 200:
                graph = response.json()
                if 'nodes' in graph and 'edges' in graph:
                    response.success()
                else:
                    response.failure("Invalid graph structure")
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(6)  # Trọng số 6: Thường xuyên lấy tours
    def get_tours(self):
        """Giả lập lấy danh sách tours"""
        with self.client.get("/api/tours", catch_response=True) as response:
            if response.status_code == 200:
                tours = response.json()
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(5)  # Trọng số 5: Test pathfinding logic
    def test_pathfinding(self):
        """Giả lập tìm đường giữa 2 điểm (test logic pathfinding)"""
        if len(self.scene_ids) < 2:
            return
        
        # Chọn 2 scene ID ngẫu nhiên
        from_id = random.choice(self.scene_ids)
        to_id = random.choice([s for s in self.scene_ids if s != from_id])
        
        # Test bằng cách lấy graph và tính toán path ở client
        # (Vì không có endpoint /api/pathfinding riêng)
        if self.graph_data and 'nodes' in self.graph_data and 'edges' in self.graph_data:
            # Simulate pathfinding bằng cách verify graph có đủ data
            nodes = self.graph_data.get('nodes', [])
            edges = self.graph_data.get('edges', [])
            
            # Kiểm tra từ và đến có trong graph không
            from_exists = any(n.get('id') == from_id for n in nodes)
            to_exists = any(n.get('id') == to_id for n in nodes)
            
            if from_exists and to_exists:
                # Pathfinding logic có thể được thực hiện ở đây
                # Nhưng để đơn giản, chỉ verify graph data
                pass
    
    @task(4)  # Trọng số 4: Health check
    def health_check(self):
        """Kiểm tra health của server"""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'ok':
                    response.success()
                else:
                    response.failure("Health check failed")
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(3)  # Trọng số 3: Analytics tracking
    def tracking_analytics_visit(self):
        """Giả lập hệ thống gửi tracking visit"""
        with self.client.post("/api/analytics/visit", 
                            json={"referrer": "locust_test"},
                            catch_response=True) as response:
            if response.status_code in [200, 201]:
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(2)  # Trọng số 2: Analytics ping
    def tracking_analytics_ping(self):
        """Giả lập ping để giữ session alive"""
        with self.client.post("/api/analytics/ping",
                            json={"timestamp": "locust_test"},
                            catch_response=True) as response:
            if response.status_code in [200, 201]:
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(1)  # Trọng số 1: Ít xảy ra hơn (nghe thuyết minh)
    def use_tts(self):
        """Giả lập người dùng bấm nghe thuyết minh"""
        # Gửi text ngắn để test API TTS
        texts = [
            "Chào mừng đến với Đại học Bình Dương",
            "Đây là phòng học",
            "Bạn đang ở tầng trệt"
        ]
        text = random.choice(texts)
        
        with self.client.post("/tts/generate", 
                            json={
                                "text": text,
                                "voice": "vi-VN-Wavenet-A"
                            },
                            catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                if 'url' in data or 'audio_url' in data:
                    response.success()
                else:
                    response.failure("No audio URL in response")
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(1)  # Trọng số 1: Lấy stats
    def get_analytics_stats(self):
        """Giả lập admin xem thống kê"""
        with self.client.get("/api/analytics/stats", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")
    
    @task(1)  # Trọng số 1: Lấy concurrent users
    def get_concurrent_users(self):
        """Giả lập kiểm tra số người dùng đồng thời"""
        with self.client.get("/api/analytics/concurrent", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")
