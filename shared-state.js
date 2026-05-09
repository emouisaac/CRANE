(function attachCraneShared(global) {
  const apiBase = "";

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = new Error(payload.error || "Request failed.");
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function connectEvents(onRefresh) {
    const source = new EventSource("/api/events");
    const handleRefresh = () => onRefresh?.();

    source.addEventListener("refresh", handleRefresh);
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) {
        source.close();
        setTimeout(() => connectEvents(onRefresh), 1500);
      }
    });

    return source;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value, options) {
    if (!value) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-UG", options || {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function formatDateTime(value) {
    if (!value) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-UG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "CC";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function humanizeStatus(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function drawLineChart(canvas, history) {
    if (!canvas || !canvas.getContext) {
      return;
    }

    const context = canvas.getContext("2d");
    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 180;

    canvas.width = width * 2;
    canvas.height = height * 2;
    context.scale(2, 2);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    const padding = 18;
    const points = history.length ? history : [{ score: 520 }, { score: 560 }];
    const scores = points.map((item) => Number(item.score || 0));
    const min = Math.min(...scores, 300);
    const max = Math.max(...scores, 850);
    const range = Math.max(max - min, 1);

    context.strokeStyle = "rgba(18, 37, 27, 0.08)";
    context.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      const y = padding + ((height - padding * 2) / 3) * row;
      context.beginPath();
      context.moveTo(padding, y);
      context.lineTo(width - padding, y);
      context.stroke();
    }

    context.strokeStyle = "#0d8b63";
    context.lineWidth = 3;
    context.beginPath();

    points.forEach((point, index) => {
      const x = padding + ((width - padding * 2) / Math.max(points.length - 1, 1)) * index;
      const y = height - padding - (((Number(point.score || 0) - min) / range) * (height - padding * 2));

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    points.forEach((point, index) => {
      const x = padding + ((width - padding * 2) / Math.max(points.length - 1, 1)) * index;
      const y = height - padding - (((Number(point.score || 0) - min) / range) * (height - padding * 2));
      context.fillStyle = "#0d8b63";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#5f7165";
      context.font = "11px Manrope, sans-serif";
      context.fillText(String(point.score || "--"), Math.max(4, x - 14), Math.max(12, y - 10));
    });
  }

  global.CraneShared = {
    request,
    connectEvents,
    fileToDataUrl,
    formatCurrency,
    formatDate,
    formatDateTime,
    initials,
    escapeHtml,
    humanizeStatus,
    drawLineChart
  };
})(window);
