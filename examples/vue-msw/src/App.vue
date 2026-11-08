<script setup lang="ts">
import { onMounted, ref } from 'vue'

const hasCookie = ref(false)
const loading = ref(false)
const result = ref('')

function readCookie(): void {
  hasCookie.value = document.cookie
    .split('; ')
    .some((cookie) => cookie.startsWith('your_token_name='))
}

async function checkSession(): Promise<void> {
  loading.value = true
  try {
    const response = await fetch('/api/me')
    result.value = `HTTP ${response.status}\n${await response.text()}`
  } catch (error) {
    result.value = String(error)
  } finally {
    loading.value = false
    readCookie()
  }
}

function clearCookie(): void {
  document.cookie = 'your_token_name=; Max-Age=0; Path=/; SameSite=Lax'
  readCookie()
  result.value = 'Cookie cleared. Check the session for a 401, or reload to log in again.'
}

function reload(): void {
  window.location.reload()
}

onMounted(() => {
  readCookie()
  void checkSession()
})
</script>

<template>
  <main>
    <p class="eyebrow">VUE + MSW / LOCAL EXAMPLE</p>
    <h1>Skip the login.<br />Start building.</h1>
    <p class="intro">
      The Vite plugin signs in with the mock API before serving this page. Your browser receives an
      authentication cookie automatically.
    </p>

    <section aria-labelledby="session-title">
      <div class="status">
        <h2 id="session-title">Your session</h2>
        <span :class="{ active: hasCookie }">{{ hasCookie ? 'Cookie present' : 'No cookie' }}</span>
      </div>
      <p>Call the protected endpoint to verify the cookie, or clear it to try the failure path.</p>
      <div class="actions">
        <button :disabled="loading" @click="checkSession">
          {{ loading ? 'Checking…' : 'Check session' }}
        </button>
        <button class="secondary" @click="clearCookie">Clear cookie</button>
        <button class="secondary" @click="reload">Reload &amp; log in</button>
      </div>
      <pre aria-live="polite">{{ result }}</pre>
    </section>

    <footer>
      Demo credentials only · Cookie: <code>your_token_name</code> · Tokens expire after 5 minutes
    </footer>
  </main>
</template>

<style>
:root {
  font-family: Inter, system-ui, sans-serif;
  color: #16302b;
  background: #f3f5ef;
  font-synthesis: none;
}
body {
  margin: 0;
}
main {
  max-width: 720px;
  margin: 0 auto;
  padding: 72px 24px;
}
.eyebrow {
  color: #467264;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
h1 {
  font-size: clamp(40px, 7vw, 64px);
  line-height: 1.06;
  letter-spacing: -0.05em;
}
.intro,
section > p {
  color: #52675e;
  line-height: 1.7;
}
section {
  margin: 36px 0 24px;
  padding: 24px;
  background: white;
  border: 1px solid #dae4da;
  border-radius: 16px;
}
.status,
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.status {
  justify-content: space-between;
}
h2 {
  font-size: 20px;
}
.status span {
  padding: 6px 10px;
  border-radius: 20px;
  background: #f5e6dc;
  font-size: 12px;
}
.status .active {
  background: #def2df;
}
button {
  padding: 12px 16px;
  border: 1px solid #275e48;
  border-radius: 8px;
  background: #275e48;
  color: white;
  font: inherit;
  cursor: pointer;
}
button.secondary {
  background: white;
  color: #275e48;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
button:focus-visible {
  outline: 3px solid #91b59f;
  outline-offset: 3px;
}
pre {
  padding: 16px;
  background: #f3f5ef;
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-height: 48px;
}
footer {
  font-size: 12px;
  color: #52675e;
  line-height: 1.8;
}
</style>
