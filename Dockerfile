# Upstream's image, pinned. The wrapper only adds the Railway entrypoint and the first-boot
# admin setup; upstream's own entrypoint still runs first and hands /data to the node user.
FROM ghcr.io/bretzel-app/crumbs:0.38.0

COPY --chmod=0755 railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
COPY railway/ /app/railway/

# railway-entrypoint.sh starts `node build` itself (upstream's CMD), so no CMD is needed.
ENTRYPOINT ["crumbs-entrypoint.sh", "railway-entrypoint.sh"]
