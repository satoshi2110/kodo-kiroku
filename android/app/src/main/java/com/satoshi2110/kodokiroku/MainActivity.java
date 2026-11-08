package com.satoshi2110.kodokiroku;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // アプリの中だけの部品（PDF レポートの印刷）を登録する
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
