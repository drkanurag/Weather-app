/**
 * AETHER — High-Performance Data Structures & Algorithms (DSA) Engine
 * Designed for minimum response time (sub-millisecond execution):
 *
 * 1. LRUCache (Doubly-Linked List + Hash Map)        -> O(1) get, O(1) put, O(1) eviction
 * 2. CityPrefixTrie (Autocomplete Prefix Tree)       -> O(L) prefix search (L = query length)
 * 3. KDTree2D (2D Spatial Partitioning Tree)         -> O(log N) nearest-neighbor coordinate search
 * 4. binarySearchTimestamp (Lower-Bound Binary Search)-> O(log N) timeline index lookup
 * 5. PrefixSum1D & MonotonicDeque                    -> O(1) range sum/avg queries & O(N) sliding window
 * 6. InFlightCoalescer (Singleflight Hash Map)       -> O(1) duplicate request deduplication
 */

// ============================================================================
// 1. DOUBLY-LINKED LIST + HASH MAP LRU CACHE — O(1) TIME COMPLEXITY
// ============================================================================
class LRUNode {
  constructor(key, value, expiresAt) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
  }
}

export class LRUCache {
  constructor(capacity = 128, defaultTtlMs = 5 * 60 * 1000) {
    this.capacity = Math.max(8, capacity);
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map(); // Hash Map for O(1) node access
    // Sentinel head (MRU) and tail (LRU) nodes for O(1) splice
    this.head = new LRUNode(null, null, 0);
    this.tail = new LRUNode(null, null, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  _removeNode(node) {
    const prev = node.prev;
    const next = node.next;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    node.prev = null;
    node.next = null;
  }

  _insertAtHead(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  get(key) {
    const node = this.map.get(key);
    if (!node) {
      // Check L2 Persistent SWR Cache (localStorage) on L1 RAM miss
      try {
        const rawL2 = localStorage.getItem(`aether_l2_${key}`);
        if (rawL2) {
          const parsed = JSON.parse(rawL2);
          if (parsed && Date.now() <= parsed.expiresAt) {
            this.set(key, parsed.value, parsed.expiresAt - Date.now(), false);
            this.hits += 1;
            return parsed.value;
          }
        }
      } catch (e) {}
      this.misses += 1;
      return undefined;
    }
    if (Date.now() > node.expiresAt) {
      this._removeNode(node);
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Move accessed node to Most-Recently-Used (MRU) head in O(1)
    this._removeNode(node);
    this._insertAtHead(node);
    this.hits += 1;
    return node.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs, persistL2 = true) {
    const expiresAt = Date.now() + ttlMs;
    if (this.map.has(key)) {
      const existing = this.map.get(key);
      existing.value = value;
      existing.expiresAt = expiresAt;
      this._removeNode(existing);
      this._insertAtHead(existing);
    } else {
      if (this.map.size >= this.capacity) {
        // Evict Least-Recently-Used (LRU) node from tail.prev in O(1)
        const lruNode = this.tail.prev;
        if (lruNode && lruNode !== this.head) {
          this._removeNode(lruNode);
          this.map.delete(lruNode.key);
          this.evictions += 1;
        }
      }
      const newNode = new LRUNode(key, value, expiresAt);
      this._insertAtHead(newNode);
      this.map.set(key, newNode);
    }
    // Write-through to L2 Persistent SWR Cache for small/medium payloads
    if (persistL2 && (key.startsWith("q:") || key.startsWith("rev:"))) {
      try {
        localStorage.setItem(
          `aether_l2_${key}`,
          JSON.stringify({ value, expiresAt })
        );
      } catch (e) {}
    }
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatioPct: total > 0 ? Math.round((this.hits / total) * 100) : 100,
      complexity: "L1 O(1) Doubly-Linked LRU + L2 Persistent SWR",
    };
  }
}

// ============================================================================
// 2. PREFIX TRIE FOR INSTANT O(L) CITY AUTOCOMPLETE
// ============================================================================
class TrieNode {
  constructor() {
    this.children = Object.create(null);
    this.topCities = []; // Pre-ranked top matches at this prefix node
  }
}

export class CityPrefixTrie {
  constructor(maxSuggestionsPerNode = 8) {
    this.root = new TrieNode();
    this.maxSuggestionsPerNode = maxSuggestionsPerNode;
    this.indexedCount = 0;
  }

  insert(cityObj) {
    if (!cityObj || !cityObj.name) return;
    const keys = [
      cityObj.name.toLowerCase(),
      ...(cityObj.aliases || []).map((a) => a.toLowerCase()),
    ];
    this.indexedCount += 1;

    keys.forEach((word) => {
      let node = this.root;
      for (let i = 0; i < word.length; i += 1) {
        const ch = word[i];
        if (!node.children[ch]) {
          node.children[ch] = new TrieNode();
        }
        node = node.children[ch];
        // Maintain deduplicated top-K list at each prefix node for O(L) retrieval
        const exists = node.topCities.some(
          (c) =>
            c.name.toLowerCase() === cityObj.name.toLowerCase() &&
            c.countryCode === cityObj.countryCode
        );
        if (!exists && node.topCities.length < this.maxSuggestionsPerNode) {
          node.topCities.push(cityObj);
        }
      }
    });
  }

  searchPrefix(prefix) {
    const clean = (prefix || "").trim().toLowerCase();
    if (!clean) return [];
    let node = this.root;
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      if (!node.children[ch]) {
        return [];
      }
      node = node.children[ch];
    }
    return node.topCities;
  }
}

// ============================================================================
// 3. 2D SPATIAL K-D TREE FOR O(log N) NEAREST-NEIGHBOR GEOCODING
// ============================================================================
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class KDNode {
  constructor(point, axis, left = null, right = null) {
    this.point = point;
    this.axis = axis; // 0 = latitude, 1 = longitude
    this.left = left;
    this.right = right;
  }
}

export class KDTree2D {
  constructor(points = []) {
    this.size = points.length;
    this.root = this._build([...points], 0);
  }

  _build(pts, depth) {
    if (!pts || pts.length === 0) return null;
    const axis = depth % 2;
    pts.sort((a, b) =>
      axis === 0 ? a.latitude - b.latitude : a.longitude - b.longitude
    );
    const mid = pts.length >> 1;
    return new KDNode(
      pts[mid],
      axis,
      this._build(pts.slice(0, mid), depth + 1),
      this._build(pts.slice(mid + 1), depth + 1)
    );
  }

  findNearest(lat, lon, maxDistanceKm = Infinity) {
    let best = { node: null, distKm: Infinity };

    const search = (node) => {
      if (!node) return;
      const p = node.point;
      const dKm = haversineDistanceKm(lat, lon, p.latitude, p.longitude);
      if (dKm < best.distKm) {
        best = { node: p, distKm: dKm };
      }

      const axis = node.axis;
      const targetCoord = axis === 0 ? lat : lon;
      const nodeCoord = axis === 0 ? p.latitude : p.longitude;
      const diffDeg = targetCoord - nodeCoord;

      const primary = diffDeg < 0 ? node.left : node.right;
      const secondary = diffDeg < 0 ? node.right : node.left;

      search(primary);

      // Approximate degree-to-km lower bound for hyperplane pruning
      const planeDistKm = Math.abs(diffDeg) * 111.32;
      if (planeDistKm < best.distKm) {
        search(secondary);
      }
    };

    search(this.root);
    if (best.node && best.distKm <= maxDistanceKm) {
      return { city: best.node, distanceKm: Number(best.distKm.toFixed(2)) };
    }
    return null;
  }
}

// ============================================================================
// 4. O(log N) LOWER-BOUND BINARY SEARCH ON SORTED ISO TIMESTAMPS
// ============================================================================
export function binarySearchTimestamp(sortedTimes, targetIso) {
  if (!Array.isArray(sortedTimes) || sortedTimes.length === 0) return 0;
  if (!targetIso) return 0;

  const prefix = targetIso.slice(0, 13); // "YYYY-MM-DDTHH"
  let lo = 0;
  let hi = sortedTimes.length - 1;
  let bestIdx = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midVal = sortedTimes[mid].slice(0, 13);
    if (midVal === prefix) {
      return mid;
    }
    if (midVal < prefix) {
      bestIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return bestIdx;
}

// ============================================================================
// 5. O(1) RANGE QUERIES VIA PREFIX SUM ARRAY & O(N) MONOTONIC DEQUE
// ============================================================================
export class PrefixSum1D {
  constructor(values = []) {
    const n = values.length;
    this.n = n;
    this.prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) {
      this.prefix[i + 1] = this.prefix[i] + (Number(values[i]) || 0);
    }
  }

  // O(1) inclusive range sum [left..right]
  rangeSum(left, right) {
    if (this.n === 0) return 0;
    const l = Math.max(0, Math.min(this.n - 1, left));
    const r = Math.max(l, Math.min(this.n - 1, right));
    return this.prefix[r + 1] - this.prefix[l];
  }

  // O(1) inclusive range average [left..right]
  rangeAvg(left, right, fallback = 0) {
    if (this.n === 0) return fallback;
    const l = Math.max(0, Math.min(this.n - 1, left));
    const r = Math.max(l, Math.min(this.n - 1, right));
    const count = r - l + 1;
    return count > 0 ? this.rangeSum(l, r) / count : fallback;
  }
}

/**
 * Finds the best contiguous K-hour outdoor window in O(N) time using a Sliding Window.
 */
export function findOptimalOutdoorWindow(hours = [], windowSize = 3) {
  if (!Array.isArray(hours) || hours.length === 0) return null;
  const k = Math.min(windowSize, hours.length);

  // Score each hour in O(N) for human outdoor comfort
  const scores = hours.map((h) => {
    const temp = Number(h.temp ?? 22);
    const rainProb = Number(h.precipProb ?? 0);
    const uv = Number(h.uvIndex ?? 2);
    const wind = Number(h.windSpeed ?? 10);
    const daytimeBonus = h.isDay ? 18 : 0;
    const tempPenalty = Math.abs(temp - 23) * 2.2;
    const rainPenalty = rainProb * 0.85 + (Number(h.precipMm || 0) > 0 ? 35 : 0);
    const uvPenalty = uv > 7 ? (uv - 7) * 5 : 0;
    const windPenalty = wind > 25 ? (wind - 25) * 1.5 : 0;
    return Math.max(
      0,
      Math.min(
        100,
        100 + daytimeBonus - tempPenalty - rainPenalty - uvPenalty - windPenalty
      )
    );
  });

  // Sliding window sum in O(N)
  let windowSum = 0;
  for (let i = 0; i < k; i += 1) windowSum += scores[i];
  let bestSum = windowSum;
  let bestStart = 0;

  for (let i = k; i < scores.length; i += 1) {
    windowSum += scores[i] - scores[i - k];
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = i - k + 1;
    }
  }

  const startHr = hours[bestStart];
  const endHr = hours[Math.min(hours.length - 1, bestStart + k - 1)];
  return {
    startHour: startHr?.hourNumber ?? 8,
    endHour: ((endHr?.hourNumber ?? 10) + 1) % 24,
    score: Math.round(bestSum / k),
    avgTemp: Math.round(
      hours
        .slice(bestStart, bestStart + k)
        .reduce((acc, h) => acc + (h.temp ?? 22), 0) / k
    ),
  };
}

// ============================================================================
// 6. IN-FLIGHT REQUEST COALESCER (SINGLEFLIGHT PATTERN) — O(1) DEDUPLICATION
// ============================================================================
export class InFlightCoalescer {
  constructor() {
    this.inflight = new Map();
    this.coalescedSaved = 0;
  }

  async run(key, asyncFactory) {
    if (this.inflight.has(key)) {
      this.coalescedSaved += 1;
      return this.inflight.get(key);
    }
    const promise = (async () => {
      try {
        return await asyncFactory();
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}

// ============================================================================
// PRE-INDEXED GLOBAL & INDIAN CITIES FOR O(L) TRIE & O(log N) K-D TREE
// ============================================================================
export const SEED_CITIES = [
  { id: "manipal-in", name: "Manipal", aliases: ["mahe", "mit manipal"], admin1: "Karnataka", country: "India", countryCode: "IN", latitude: 13.3525, longitude: 74.7928, elevation: 75, timezone: "Asia/Kolkata" },
  { id: "udupi-in", name: "Udupi", aliases: ["udipi", "malpe"], admin1: "Karnataka", country: "India", countryCode: "IN", latitude: 13.3409, longitude: 74.7421, elevation: 20, timezone: "Asia/Kolkata" },
  { id: "mangaluru-in", name: "Mangaluru", aliases: ["mangalore"], admin1: "Karnataka", country: "India", countryCode: "IN", latitude: 12.9141, longitude: 74.856, elevation: 22, timezone: "Asia/Kolkata" },
  { id: "bangalore-in", name: "Bengaluru", aliases: ["bangalore", "blr"], admin1: "Karnataka", country: "India", countryCode: "IN", latitude: 12.9716, longitude: 77.5946, elevation: 920, timezone: "Asia/Kolkata" },
  { id: "mumbai-in", name: "Mumbai", aliases: ["bombay"], admin1: "Maharashtra", country: "India", countryCode: "IN", latitude: 19.076, longitude: 72.8777, elevation: 14, timezone: "Asia/Kolkata" },
  { id: "delhi-in", name: "New Delhi", aliases: ["delhi", "ncr"], admin1: "Delhi", country: "India", countryCode: "IN", latitude: 28.6139, longitude: 77.209, elevation: 216, timezone: "Asia/Kolkata" },
  { id: "hyderabad-in", name: "Hyderabad", aliases: ["hyd"], admin1: "Telangana", country: "India", countryCode: "IN", latitude: 17.385, longitude: 78.4867, elevation: 542, timezone: "Asia/Kolkata" },
  { id: "chennai-in", name: "Chennai", aliases: ["madras"], admin1: "Tamil Nadu", country: "India", countryCode: "IN", latitude: 13.0827, longitude: 80.2707, elevation: 7, timezone: "Asia/Kolkata" },
  { id: "kolkata-in", name: "Kolkata", aliases: ["calcutta"], admin1: "West Bengal", country: "India", countryCode: "IN", latitude: 22.5726, longitude: 88.3639, elevation: 9, timezone: "Asia/Kolkata" },
  { id: "pune-in", name: "Pune", aliases: ["poona"], admin1: "Maharashtra", country: "India", countryCode: "IN", latitude: 18.5204, longitude: 73.8567, elevation: 560, timezone: "Asia/Kolkata" },
  { id: "kochi-in", name: "Kochi", aliases: ["cochin", "ernakulam"], admin1: "Kerala", country: "India", countryCode: "IN", latitude: 9.9312, longitude: 76.2673, elevation: 4, timezone: "Asia/Kolkata" },
  { id: "goa-in", name: "Panaji", aliases: ["goa", "panjim"], admin1: "Goa", country: "India", countryCode: "IN", latitude: 15.4909, longitude: 73.8278, elevation: 7, timezone: "Asia/Kolkata" },
  { id: "mysuru-in", name: "Mysuru", aliases: ["mysore"], admin1: "Karnataka", country: "India", countryCode: "IN", latitude: 12.2958, longitude: 76.6394, elevation: 763, timezone: "Asia/Kolkata" },
  { id: "jaipur-in", name: "Jaipur", aliases: ["pink city"], admin1: "Rajasthan", country: "India", countryCode: "IN", latitude: 26.9124, longitude: 75.7873, elevation: 431, timezone: "Asia/Kolkata" },
  { id: "ahmedabad-in", name: "Ahmedabad", aliases: ["amdavad"], admin1: "Gujarat", country: "India", countryCode: "IN", latitude: 23.0225, longitude: 72.5714, elevation: 53, timezone: "Asia/Kolkata" },
  { id: "tokyo-jp", name: "Tokyo", aliases: ["tyo"], admin1: "Tokyo", country: "Japan", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, elevation: 40, timezone: "Asia/Tokyo" },
  { id: "new-york-us", name: "New York", aliases: ["nyc", "manhattan"], admin1: "New York", country: "United States", countryCode: "US", latitude: 40.7128, longitude: -74.006, elevation: 10, timezone: "America/New_York" },
  { id: "london-gb", name: "London", aliases: ["uk", "ldn"], admin1: "England", country: "United Kingdom", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, elevation: 11, timezone: "Europe/London" },
  { id: "zurich-ch", name: "Zurich", aliases: ["zuerich"], admin1: "Zurich", country: "Switzerland", countryCode: "CH", latitude: 47.3769, longitude: 8.5417, elevation: 408, timezone: "Europe/Zurich" },
  { id: "reykjavik-is", name: "Reykjavik", aliases: ["iceland"], admin1: "Capital Region", country: "Iceland", countryCode: "IS", latitude: 64.1466, longitude: -21.9426, elevation: 14, timezone: "Atlantic/Reykjavik" },
  { id: "dubai-ae", name: "Dubai", aliases: ["uae", "dxb"], admin1: "Dubai", country: "United Arab Emirates", countryCode: "AE", latitude: 25.2048, longitude: 55.2708, elevation: 5, timezone: "Asia/Dubai" },
  { id: "sydney-au", name: "Sydney", aliases: ["syd"], admin1: "New South Wales", country: "Australia", countryCode: "AU", latitude: -33.8688, longitude: 151.2093, elevation: 3, timezone: "Australia/Sydney" },
  { id: "singapore-sg", name: "Singapore", aliases: ["sg", "sin"], admin1: "Central Singapore", country: "Singapore", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, elevation: 15, timezone: "Asia/Singapore" },
  { id: "paris-fr", name: "Paris", aliases: ["par"], admin1: "Île-de-France", country: "France", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, elevation: 35, timezone: "Europe/Paris" },
  { id: "san-francisco-us", name: "San Francisco", aliases: ["sf", "bay area"], admin1: "California", country: "United States", countryCode: "US", latitude: 37.7749, longitude: -122.4194, elevation: 16, timezone: "America/Los_Angeles" },
];

// Global Singleton DSA Instances for Minimum Response Time
export const weatherBundleLRU = new LRUCache(64, 5 * 60 * 1000); // 5-min TTL
export const customDateLRU = new LRUCache(128, 15 * 60 * 1000); // 15-min TTL
export const searchQueryLRU = new LRUCache(128, 15 * 60 * 1000); // 15-min TTL
export const reverseGeoLRU = new LRUCache(128, 30 * 60 * 1000); // 30-min TTL
export const requestCoalescer = new InFlightCoalescer();

export const globalCityTrie = new CityPrefixTrie(8);
SEED_CITIES.forEach((c) => globalCityTrie.insert(c));

export const globalCityKDTree = new KDTree2D(SEED_CITIES);

