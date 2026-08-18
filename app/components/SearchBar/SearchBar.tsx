'use client';

import React, { useCallback, memo, useState } from 'react';
import { MdSearch, MdClear } from 'react-icons/md';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  placeholder?: string;
}

const SearchBar = memo(function SearchBar({
  value,
  onChange,
  onReset,
  placeholder = '검색어를 입력해주세요.',
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const handleSearch = useCallback(() => {
    onChange(inputValue);
  }, [inputValue, onChange]);

  const handleReset = useCallback(() => {
    setInputValue('');
    onReset();
  }, [onReset]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div className={styles.searchBar}>
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        className={styles.input}
      />
      <button className={styles.searchBtn} onClick={handleSearch}>
        <MdSearch />
      </button>
      <button className={styles.resetBtn} onClick={handleReset}>
        <MdClear />
      </button>
    </div>
  );
});

export default SearchBar;
