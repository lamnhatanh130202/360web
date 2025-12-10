import React, { useEffect, useState } from "react";

const apiBase = "/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("day");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [scenesCount, setScenesCount] = useState(0);
  const [hotspotsCount, setHotspotsCount] = useState(0);

  // Generate list of available years (current year and 2 years back)
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 3 }, (_, i) => (currentYear - i).toString());

  // Generate list of months
  const months = [
    { value: "1", label: "Tháng 1" },
    { value: "2", label: "Tháng 2" },
    { value: "3", label: "Tháng 3" },
    { value: "4", label: "Tháng 4" },
    { value: "5", label: "Tháng 5" },
    { value: "6", label: "Tháng 6" },
    { value: "7", label: "Tháng 7" },
    { value: "8", label: "Tháng 8" },
    { value: "9", label: "Tháng 9" },
    { value: "10", label: "Tháng 10" },
    { value: "11", label: "Tháng 11" },
    { value: "12", label: "Tháng 12" }
  ];

  useEffect(() => {
    loadStats();
    loadScenes();
  }, [period, selectedYear, selectedMonth]);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      let url = `${apiBase}/analytics/stats?period=${period}`;
      if (selectedYear) {
        url += `&year=${selectedYear}`;
      }
      if (period === "day" && selectedMonth) {
        url += `&month=${selectedMonth}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error("Không tải được thống kê");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      setError(e.message || "Không thể tải thống kê");
    } finally {
      setLoading(false);
    }
  }

  async function loadScenes() {
    try {
      const res = await fetch(`${apiBase}/scenes`);
      if (res.ok) {
        const scenes = await res.json();
        setScenesCount(scenes.length);
        const totalHotspots = scenes.reduce((sum, s) => sum + (s.hotspots?.length || 0), 0);
        setHotspotsCount(totalHotspots);
      }
    } catch (e) {
      console.warn("Failed to load scenes count:", e);
    }
  }

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [period, selectedYear, selectedMonth]);

  if (loading && !stats) {
    return <div className="scenes-loading">Đang tải thống kê...</div>;
  }

  if (error) {
    return <div className="scenes-error">{error}</div>;
  }

  // Tính max với padding để các bar không quá thấp
  const maxVisits = stats?.data?.length > 0 
    ? Math.max(...stats.data.map(d => d.visits || 0))
    : 1;
  
  // Thêm 20% padding để các bar không sát đỉnh và dễ phân biệt hơn
  const chartMax = maxVisits > 0 ? Math.ceil(maxVisits * 1.2) : 10;
  
  // Đảm bảo chiều cao tối thiểu cho các bar có giá trị > 0
  const minBarHeight = 10; // 10% chiều cao tối thiểu (tăng từ 8%)

  return (
    <div className="cms-container">
      <div className="scenes-list-header">
        <h1 className="scenes-list-title">Dashboard - Thống kê truy cập</h1>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "20px",
        marginTop: 24,
        marginBottom: 32
      }}>
        <div style={{
          background: "var(--panel)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>Đang truy cập</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)" }}>
            {stats?.current_concurrent || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            người đang online
          </div>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
          color: "white"
        }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", marginBottom: 8, fontWeight: 500 }}>Cao nhất cùng lúc</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#ffffff", lineHeight: 1.2 }}>
            {stats?.peak_concurrent || 0}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 8, fontWeight: 500 }}>
            {stats?.peak_concurrent_date 
              ? new Date(stats.peak_concurrent_date).toLocaleString('vi-VN', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : "Chưa có dữ liệu"}
          </div>
        </div>

        <div style={{
          background: "var(--panel)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>Tổng lượt truy cập</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#8b5cf6" }}>
            {stats?.total_visits_all_time || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            từ trước đến nay
          </div>
        </div>

        <div style={{
          background: "var(--panel)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>Lượt truy cập hôm nay</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#ec4899" }}>
            {stats?.today_visits || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            trong ngày hôm nay
          </div>
        </div>

        <div style={{
          background: "var(--panel)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>Tổng Scenes</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#6366f1" }}>
            {scenesCount}
          </div>
        </div>

        <div style={{
          background: "var(--panel)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>Tổng Hotspots</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#f59e0b" }}>
            {hotspotsCount}
          </div>
        </div>
      </div>

      {/* Period and Filter Selector */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 24,
        background: "var(--panel)",
        padding: 20,
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.06)"
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Xem theo:</label>
          <button
            onClick={() => setPeriod("day")}
            className={period === "day" ? "scene-modal-btn-primary" : "scene-modal-btn-secondary"}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Theo ngày
          </button>
          <button
            onClick={() => setPeriod("week")}
            className={period === "week" ? "scene-modal-btn-primary" : "scene-modal-btn-secondary"}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Theo tuần
          </button>
          <button
            onClick={() => setPeriod("month")}
            className={period === "month" ? "scene-modal-btn-primary" : "scene-modal-btn-secondary"}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Theo tháng
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Năm:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.1)",
              background: "white",
              cursor: "pointer"
            }}
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {period === "day" && (
            <>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginLeft: 8 }}>Tháng:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: "8px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid rgba(15,23,42,0.1)",
                  background: "white",
                  cursor: "pointer"
                }}
              >
                {months.map(month => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      {stats && stats.data && stats.data.length > 0 && (
        <div style={{
          background: "var(--panel)",
          padding: 32,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "var(--shadow)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
              Biểu đồ truy cập {period === "day" 
                ? `theo ngày - ${months.find(m => m.value === selectedMonth)?.label || selectedMonth}/${selectedYear}`
                : period === "week" 
                  ? `theo tuần - Năm ${selectedYear}`
                  : `theo tháng - Năm ${selectedYear}`}
            </h3>
            <div style={{ fontSize: 14, color: "var(--muted)" }}>
              Tổng: <strong style={{ color: "var(--accent)", fontSize: 16 }}>{stats.data.reduce((sum, d) => sum + (d.visits || 0), 0)}</strong> lượt | 
              Cao nhất: <strong style={{ color: "#10b981", fontSize: 16 }}>{maxVisits}</strong> lượt
            </div>
          </div>
          
          {/* Y-axis labels */}
          <div style={{ display: "flex", position: "relative", marginBottom: 8 }}>
            <div style={{ 
              width: 60, 
              display: "flex", 
              flexDirection: "column", 
              justifyContent: "space-between",
              height: 400,
              fontSize: 13,
              color: "var(--muted)",
              paddingRight: 12,
              textAlign: "right",
              fontWeight: 600
            }}>
              <div>{chartMax}</div>
              <div>{Math.floor(chartMax * 0.75)}</div>
              <div>{Math.floor(chartMax * 0.5)}</div>
              <div>{Math.floor(chartMax * 0.25)}</div>
              <div>0</div>
            </div>
            
            {/* Chart bars */}
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 400,
              minHeight: 400,
              padding: "0 0 20px 0",
              borderBottom: "3px solid rgba(15,23,42,0.15)",
              borderLeft: "3px solid rgba(15,23,42,0.15)",
              paddingLeft: 16,
              position: "relative",
              overflow: "visible"
            }}>
              {stats.data.map((item, idx) => {
                const visits = item.visits || 0;
                // Tính height với chartMax (có padding) và đảm bảo chiều cao tối thiểu
                const baseHeight = chartMax > 0 ? (visits / chartMax) * 100 : 0;
                // Nếu có giá trị > 0, đảm bảo chiều cao tối thiểu là minBarHeight%
                // Nếu = 0, vẫn hiển thị bar nhỏ để người dùng thấy có dữ liệu
                const height = visits > 0 
                  ? Math.max(baseHeight, minBarHeight) 
                  : 2; // Hiển thị bar nhỏ 2% ngay cả khi = 0
                
                const label = period === "day" 
                  ? item.date?.split("-")[2] 
                  : period === "week" 
                    ? `Tuần ${item.week?.split("-W")[1] || idx + 1}`
                    : item.month?.split("-")[1] || idx + 1;
                const fullDate = period === "day" 
                  ? item.date 
                  : period === "week"
                    ? item.week
                    : item.month;
                
                // Màu sắc dựa trên giá trị (gradient từ thấp đến cao)
                const intensity = chartMax > 0 ? Math.min(visits / chartMax, 1) : 0;
                const barColor = visits > 0
                  ? intensity > 0.7
                    ? "linear-gradient(to top, #1e40af, #2563eb)" // Xanh đậm cho giá trị cao
                    : intensity > 0.4
                      ? "linear-gradient(to top, #2563eb, #3b82f6)" // Xanh vừa
                      : "linear-gradient(to top, #3b82f6, #60a5fa)" // Xanh nhạt cho giá trị thấp
                  : "rgba(200, 200, 200, 0.3)"; // Màu xám nhạt cho giá trị = 0
                
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      flex: 1, 
                      display: "flex", 
                      flexDirection: "column", 
                      alignItems: "center",
                      justifyContent: "flex-end",
                      position: "relative",
                      minWidth: "20px",
                      height: "100%"
                    }}
                  >
                    {/* Bar */}
                    <div 
                      style={{
                        width: "100%",
                        maxWidth: "50px",
                        minWidth: "25px",
                        background: barColor,
                        height: `${height}%`,
                        minHeight: visits > 0 ? "30px" : "4px",
                        borderRadius: "8px 8px 0 0",
                        transition: "all 0.3s ease",
                        cursor: "pointer",
                        position: "relative",
                        border: visits > 0 ? "2px solid rgba(37, 99, 235, 0.3)" : "1px solid rgba(200, 200, 200, 0.5)",
                        boxShadow: visits > 0 ? "0 2px 8px rgba(37, 99, 235, 0.2)" : "0 1px 3px rgba(0, 0, 0, 0.1)",
                        display: "block"
                      }}
                      title={`${fullDate}: ${visits} lượt truy cập`}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scaleY(1.1) scaleX(1.15)";
                        e.currentTarget.style.boxShadow = "0 8px 20px rgba(37, 99, 235, 0.6)";
                        e.currentTarget.style.zIndex = 20;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scaleY(1) scaleX(1)";
                        e.currentTarget.style.boxShadow = item.visits > 0 ? "0 2px 8px rgba(37, 99, 235, 0.2)" : "none";
                        e.currentTarget.style.zIndex = 1;
                      }}
                    />
                    
                    {/* Value on top of bar - luôn hiển thị */}
                    {visits > 0 && (
                      <div style={{
                        position: "absolute",
                        top: `${100 - height}%`,
                        transform: "translateY(-100%)",
                        fontSize: 13,
                        fontWeight: 800,
                        color: intensity > 0.5 ? "#ffffff" : "var(--accent)",
                        background: intensity > 0.5 ? "rgba(30, 64, 175, 0.95)" : "white",
                        padding: "5px 10px",
                        borderRadius: 8,
                        boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
                        whiteSpace: "nowrap",
                        marginBottom: 8,
                        zIndex: 15,
                        border: intensity > 0.5 ? "none" : "2px solid rgba(37, 99, 235, 0.3)"
                      }}>
                        {visits}
                      </div>
                    )}
                    
                    {/* Date label */}
                    <div style={{
                      fontSize: 12,
                      color: visits > 0 ? "var(--text)" : "var(--muted)",
                      marginTop: 12,
                      textAlign: "center",
                      fontWeight: visits > 0 ? 700 : 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "100%"
                    }}>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {stats && (!stats.data || stats.data.length === 0) && (
        <div style={{
          background: "var(--panel)",
          padding: 48,
          borderRadius: 16,
          textAlign: "center",
          color: "var(--muted)"
        }}>
          Chưa có dữ liệu thống kê cho khoảng thời gian đã chọn. Dữ liệu sẽ được cập nhật khi có người truy cập.
        </div>
      )}
    </div>
  );
}
