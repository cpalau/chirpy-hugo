{{- /* Ports `assets/js/data/swconf.js` (F6).
       The service worker fetches this file, so it must never be cached. With
       the cache disabled (the default) the only setting upstream emits is
       `purge: true`; enabling it adds the resource list, the denied paths and
       the GoatCounter interceptor prefix. */ -}}
{{- $pwa := .Site.Params.pwa -}}
{{- $cache := and $pwa (index $pwa "cache") (index (index $pwa "cache") "enabled") -}}
{{- if $cache -}}
{{- $resources := slice (relURL (printf "assets/css/%s.css" (.Site.Params.theme | default "jekyll-theme-chirpy"))) (relURL "") -}}
{{- range .Site.Menus.main -}}
  {{- $resources = $resources | append (relURL .URL) -}}
{{- end -}}
{{- $paths := slice -}}
{{- with (index (index $pwa "cache") "deny_paths") -}}
  {{- range . -}}{{- with . -}}{{- $paths = $paths | append (relURL .) -}}{{- end -}}{{- end -}}
{{- end -}}
{{- $goat := and .Site.Params.analytics .Site.Params.analytics.goatcounter (index .Site.Params.analytics.goatcounter "id") (eq .Site.Params.pageviews.provider "goatcounter") -}}
const swconf = {
  cacheName: 'chirpy-{{ now.Unix }}',

  resources: [
    {{- range $i, $r := $resources }}{{ if $i }},{{ end }}
    '{{ $r }}'{{- end }}
  ],

  interceptor: {
    paths: [
      {{- range $i, $p := $paths }}{{ if $i }},{{ end }}
      '{{ $p }}'{{- end }}
    ],

    urlPrefixes: [
      {{- if $goat }}
      'https://{{ index .Site.Params.analytics.goatcounter "id" }}.goatcounter.com/counter/'
      {{- end }}
    ]
  },

  purge: false
};
{{- else -}}
const swconf = {
  purge: true
};
{{- end -}}
