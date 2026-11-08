package com.satoshi2110.kodokiroku;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * アプリの中の画面（WebView）では window.print() が開かないので、
 * Android の印刷の画面を開く小さな部品。PDF レポート（仕様書 6.12）から呼ぶ。
 * 印刷の画面のプリンターで「PDF として保存」を選ぶと PDF にできる。
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "行動記録");
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (webView == null || manager == null) {
                call.reject("印刷の画面を開けません");
                return;
            }
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build();
            manager.print(name, adapter, attributes);
            call.resolve();
        });
    }
}
