import { NativeSelect, NumberInput, NumberInputProps } from "@mantine/core";
import { useState } from "react";

const multipliers = {
  B: 1,
  KB: 1000,
  KiB: 1024,
  MB: 1000 ** 2,
  MiB: 1024 ** 2,
  GB: 1000 ** 3,
  GiB: 1024 ** 3,
  TB: 1000 ** 4,
  TiB: 1024 ** 4,
};

const units = (
  ["B", "KB", "KiB", "MB", "MiB", "GB", "GiB", "TB", "TiB"] as const
).map((unit) => ({ label: unit, value: unit }));

type UnitValue = (typeof units)[number]["value"];

function getLargestApplicableUnit(value: number) {
  return (
    units.findLast((unit) => value % multipliers[unit.value] === 0) || units[0]
  );
}

interface FileSizeInputProps extends Omit<NumberInputProps, "value" | "onChange"> {
  label?: string;
  value?: number;
  onChange?: (number: number) => void;
}

const FileSizeInput = ({
  label,
  value,
  onChange,
  ...restProps
}: FileSizeInputProps) => {
  const resolvedValue = value ?? 0;
  const [unit, setUnit] = useState<UnitValue>(getLargestApplicableUnit(resolvedValue).value);
  const [inputValue, setInputValue] = useState(resolvedValue / multipliers[unit]);
  const unitSelect = (
    <NativeSelect
      data={units}
      value={unit}
      rightSectionWidth={28}
      styles={{
        input: {
          fontWeight: 500,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          width: 76,
          marginRight: -2,
        },
      }}
      onChange={(event) => {
        const unit = event.currentTarget.value as UnitValue;
        setUnit(unit);
        onChange?.(multipliers[unit] * inputValue);
      }}
    />
  );

  return (
    <NumberInput
      label={label}
      value={inputValue}
      min={1}
      max={999999}
      rightSection={unitSelect}
      rightSectionWidth={76}
      onChange={(value) => {
        const inputVal = typeof value === "number" ? value : 0;
        setInputValue(inputVal);
        onChange?.(multipliers[unit] * inputVal);
      }}
      {...restProps}
    />
  );
};

export default FileSizeInput;
