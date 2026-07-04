package com.ultigametracker.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.ultigametracker.app.voice.VoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
