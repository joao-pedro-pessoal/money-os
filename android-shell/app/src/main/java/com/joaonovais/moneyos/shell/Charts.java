package com.joaonovais.moneyos.shell;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;

import java.util.List;

/**
 * The widgets' charts, drawn to bitmaps.
 *
 * A widget cannot run the site's chart library, so the three shapes it needs —
 * a line, a donut, two bars — are drawn here in the colours of the site's
 * default dark theme.
 */
final class Charts {
    static final int SURFACE = Color.rgb(28, 25, 18);
    static final int INK = Color.rgb(242, 234, 217);
    static final int MUTED = Color.rgb(138, 131, 117);
    static final int ACCENT = Color.rgb(201, 168, 106);
    static final int GREEN = Color.rgb(52, 211, 153);
    static final int RED = Color.rgb(248, 113, 113);
    static final int TRACK = Color.rgb(42, 36, 26);
    /** One colour per slice, the last reserved for "Other". */
    static final int[] SLICES = {
            ACCENT, Color.rgb(122, 162, 255), GREEN, Color.rgb(245, 158, 11), MUTED,
    };

    private Charts() {}

    static int sliceColor(int index, boolean other) {
        if (other) return SLICES[SLICES.length - 1];
        return SLICES[Math.min(index, SLICES.length - 2)];
    }

    /** A filled line, green when the period ended higher than it started. */
    static Bitmap line(List<double[]> points, int width, int height, float density) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        if (points.size() < 2) return bitmap;
        Canvas canvas = new Canvas(bitmap);
        double min = Double.MAX_VALUE, max = -Double.MAX_VALUE;
        for (double[] p : points) {
            min = Math.min(min, p[1]);
            max = Math.max(max, p[1]);
        }
        if (max - min < 1e-9) { max += 1; min -= 1; }
        float pad = 3 * density;
        float w = width - 2 * pad, h = height - 2 * pad;
        Path path = new Path();
        for (int i = 0; i < points.size(); i++) {
            float x = pad + w * i / (points.size() - 1);
            float y = pad + (float) (h * (1 - (points.get(i)[1] - min) / (max - min)));
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        boolean up = points.get(points.size() - 1)[1] >= points.get(0)[1];
        int color = up ? GREEN : RED;

        Path fill = new Path(path);
        fill.lineTo(pad + w, height);
        fill.lineTo(pad, height);
        fill.close();
        Paint area = new Paint(Paint.ANTI_ALIAS_FLAG);
        area.setShader(new LinearGradient(0, 0, 0, height,
                Color.argb(90, Color.red(color), Color.green(color), Color.blue(color)),
                Color.argb(0, Color.red(color), Color.green(color), Color.blue(color)),
                Shader.TileMode.CLAMP));
        canvas.drawPath(fill, area);

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2 * density);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);
        canvas.drawPath(path, stroke);
        return bitmap;
    }

    /** A donut of the slices, largest first, with a gap between them. */
    static Bitmap donut(List<Double> values, int[] colors, int size, float density) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        double total = 0;
        for (double v : values) total += v;
        float thickness = size * 0.18f;
        RectF box = new RectF(thickness / 2, thickness / 2, size - thickness / 2, size - thickness / 2);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(thickness);
        if (total <= 0) {
            paint.setColor(TRACK);
            canvas.drawArc(box, 0, 360, false, paint);
            return bitmap;
        }
        float gap = values.size() > 1 ? 2f : 0f;
        float start = -90;
        for (int i = 0; i < values.size(); i++) {
            float sweep = (float) (360 * values.get(i) / total);
            paint.setColor(colors[i]);
            canvas.drawArc(box, start + gap / 2, Math.max(0.5f, sweep - gap), false, paint);
            start += sweep;
        }
        return bitmap;
    }

    /** Income and expenses as two bars on one scale. */
    static Bitmap flows(double income, double expenses, int width, int height, float density) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        double max = Math.max(Math.max(income, expenses), 1e-9);
        float gap = 6 * density;
        float bar = (height - gap) / 2;
        float radius = bar / 2;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(TRACK);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);

        canvas.drawRoundRect(new RectF(0, 0, width, bar), radius, radius, track);
        fill.setColor(GREEN);
        if (income > 0) canvas.drawRoundRect(new RectF(0, 0, (float) Math.max(bar, width * income / max), bar), radius, radius, fill);

        canvas.drawRoundRect(new RectF(0, bar + gap, width, height), radius, radius, track);
        fill.setColor(RED);
        if (expenses > 0) canvas.drawRoundRect(new RectF(0, bar + gap, (float) Math.max(bar, width * expenses / max), height), radius, radius, fill);
        return bitmap;
    }
}
