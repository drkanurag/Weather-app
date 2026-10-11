import React, { useState, useEffect, useRef } from "react";
import { searchCities } from "../../services/weatherService";

export default function Search({
  search = "",
  setSearch = () => {},
  handleSearch = () => {},
  onSelectLocation = null,
  onLocateMe = null,
  locatingGps = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Global "/" or Ctrl+K shortcut to focus search bar
  useEffect(() => {
    const onKeyDown = (e) => {
      if (
        (e.key === "/" && document.activeElement !== inputRef.current) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")
      ) {
        if (
          document.activeElement &&
          ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced geocoding lookup
  useEffect(() => {
    if (!search || search.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchCities(search);
      if (!cancelled) {
        setSuggestions(results);
        setIsSearching(false);
        setActiveIndex(-1);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const handleChooseCity = (city) => {
    setSearch(city.name);
    setIsOpen(false);
    setSuggestions([]);
    if (onSelectLocation) {
      onSelectLocation(city);
    } else {
      handleSearch(city.name);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) =>
        suggestions.length > 0 ? (prev + 1) % suggestions.length : -1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        suggestions.length > 0
          ? (prev - 1 + suggestions.length) % suggestions.length
          : -1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        handleChooseCity(suggestions[activeIndex]);
      } else if (suggestions.length > 0 && isOpen) {
        handleChooseCity(suggestions[0]);
      } else {
        setIsOpen(false);
        handleSearch();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="aether-search-wrapper" ref={containerRef}>
      <div className="search-engine aether-search-bar">
        <span className="aether-search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search any city, airport, or coordinates... (Press /)"
          name="search"
          autoComplete="off"
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {search && (
          <button
            type="button"
            className="aether-clear-btn"
            onClick={() => {
              setSearch("");
              setSuggestions([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            title="Clear"
          >
            ×
          </button>
        )}
        {onLocateMe && (
          <button
            type="button"
            className={`aether-gps-btn ${locatingGps ? "is-locating" : ""}`}
            onClick={onLocateMe}
            title="Use my live GPS coordinates"
            aria-label="Locate Me"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span className="gps-label">{locatingGps ? "Locating..." : "GPS"}</span>
          </button>
        )}
        <button
          type="button"
          className="aether-search-submit"
          onClick={() => {
            if (suggestions.length > 0 && isOpen) {
              handleChooseCity(suggestions[0]);
            } else {
              setIsOpen(false);
              handleSearch();
            }
          }}
        >
          Search
        </button>
      </div>

      {isOpen && (search.trim().length >= 2 || isSearching) && (
        <div className="aether-search-dropdown" role="listbox">
          {isSearching ? (
            <div className="aether-dropdown-status">
              <span className="aether-pulse-dot" /> Scanning global meteorological stations...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="aether-dropdown-status">
              No matching stations found for "{search}". Try another city name.
            </div>
          ) : (
            suggestions.map((item, idx) => (
              <button
                type="button"
                key={item.id + idx}
                className={`aether-suggestion-item ${
                  idx === activeIndex ? "is-active" : ""
                }`}
                onClick={() => handleChooseCity(item)}
              >
                <div className="suggestion-main">
                  <span className="suggestion-country-badge">
                    {item.countryCode || "GL"}
                  </span>
                  <div className="suggestion-text">
                    <span className="suggestion-city">{item.name}</span>
                    <span className="suggestion-region">
                      {[item.admin1, item.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                </div>
                <div className="suggestion-meta">
                  <span>
                    {item.latitude.toFixed(2)}°N, {item.longitude.toFixed(2)}°E
                  </span>
                  {item.elevation ? <span>{item.elevation}m ASL</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
