import React, { useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';

const TARGET_URL = 'https://highest-screenshot-justify-prevention.trycloudflare.com/';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasError, setHasError] = useState(false);
  const [errorDesc, setErrorDesc] = useState('');
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(1);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const reloadApp = () => {
    setHasError(false);
    setLoading(true);
    setKey(prev => prev + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070B14" />

      {/* Camera permission banner */}
      {permission && !permission.granted && (
        <View style={styles.permBanner}>
          <Text style={styles.permText}>📷 Camera permission needed for contactless vitals scan.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {!hasError ? (
        <View style={styles.webContainer}>
          <WebView
            key={key}
            source={{ uri: TARGET_URL }}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            originWhitelist={['*']}
            onPermissionRequest={(request) => {
              request.grant(request.resources);
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              setHasError(true);
              setErrorDesc(`${nativeEvent.description || 'Connection failed'} (Code: ${nativeEvent.code})`);
            }}
          />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Connecting via Secure Cloudflare Tunnel...</Text>
              <Text style={styles.loadingSub}>🔒 Trusted HTTPS Origin</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>🚀 SOL CHECK - NASA FLIGHT DECK</Text>
          <Text style={styles.fallbackSub}>Connection Error</Text>
          <Text style={styles.fallbackDesc}>
            Target: {TARGET_URL}{"\n\n"}
            Error: {errorDesc}
          </Text>

          <TouchableOpacity style={styles.retryBtn} onPress={reloadApp}>
            <Text style={styles.retryBtnText}>↻ Retry Connection</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  permBanner: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#38bdf8',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permText: {
    color: '#f8fafc',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  permBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  permBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  webView: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070B14',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#38bdf8',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  loadingSub: {
    color: '#34d399',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#070B14',
  },
  fallbackTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackSub: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  fallbackDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
