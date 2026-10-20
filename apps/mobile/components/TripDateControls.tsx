import { Pressable, Text, View } from "react-native";
import type { AccommodationInput, ItineraryEventInput } from "../api";
import type { AppStyles, FieldComponent } from "../screenTypes";
import { addDaysToDateString, getStayNightCount, isIsoDateString } from "../utils";

const itineraryTimeOptions = [
  { label: "Morning", value: "09:00" },
  { label: "Lunch", value: "12:00" },
  { label: "Afternoon", value: "14:00" },
  { label: "Dinner", value: "18:00" },
  { label: "Evening", value: "20:00" },
];
const calendarWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ItineraryDateTimeControls({
  styles,
  Field,
  date,
  time,
  tripStart,
  tripEnd,
  dateError,
  onChange,
}: {
  styles: AppStyles;
  Field: FieldComponent;
  date: string;
  time: string;
  tripStart: string;
  tripEnd: string;
  dateError?: string;
  onChange: (patch: Partial<ItineraryEventInput>) => void;
}) {
  const tripStartDate = isIsoDateString(tripStart) ? tripStart : "";
  const tripEndDate = isIsoDateString(tripEnd) ? tripEnd : "";
  const activeDate = isIsoDateString(date) ? date : tripStartDate;
  const hasDate = Boolean(date);
  const hasTime = Boolean(time);

  return (
    <View style={styles.stayDateCard}>
      <Text style={styles.cardTitleSmall}>Event schedule</Text>
      <View style={styles.twoCol}>
        <View style={styles.dateInputColumn}>
          <Field
            label="Date"
            value={date}
            onChangeText={(nextDate) => onChange({ date: nextDate })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateInputColumn}>
          <Field
            label="Time"
            value={time}
            onChangeText={(nextTime) => onChange({ time: nextTime })}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      {dateError ? (
        <Text style={styles.error}>{dateError}</Text>
      ) : (
        <Text style={styles.helperText}>Use the chips below to fill the schedule quickly, then adjust if needed.</Text>
      )}
      <Text style={styles.filterGroupTitle}>Date shortcuts</Text>
      <View style={styles.segmentWrap}>
        <DateQuickButton
          styles={styles}
          label="Trip start"
          active={date === tripStartDate && Boolean(tripStartDate)}
          disabled={!tripStartDate}
          onPress={() => onChange({ date: tripStartDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Trip end"
          active={date === tripEndDate && Boolean(tripEndDate)}
          disabled={!tripEndDate}
          onPress={() => onChange({ date: tripEndDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Previous day"
          disabled={!activeDate}
          onPress={() => onChange({ date: addDaysToDateString(activeDate, -1) })}
        />
        <DateQuickButton
          styles={styles}
          label="Next day"
          disabled={!activeDate}
          onPress={() => onChange({ date: addDaysToDateString(activeDate, 1) })}
        />
        <DateQuickButton
          styles={styles}
          label="Clear date"
          disabled={!hasDate}
          onPress={() => onChange({ date: "" })}
        />
      </View>
      <Text style={styles.filterGroupTitle}>Time shortcuts</Text>
      <View style={styles.segmentWrap}>
        {itineraryTimeOptions.map((option) => (
          <DateQuickButton
            key={option.value}
            styles={styles}
            label={option.label}
            active={time === option.value}
            onPress={() => onChange({ time: option.value })}
          />
        ))}
        <DateQuickButton
          styles={styles}
          label="Clear time"
          disabled={!hasTime}
          onPress={() => onChange({ time: "" })}
        />
      </View>
    </View>
  );
}

export function StayDateControls({
  styles,
  Field,
  checkIn,
  checkOut,
  tripStart,
  tripEnd,
  dateError,
  onChange,
}: {
  styles: AppStyles;
  Field: FieldComponent;
  checkIn: string;
  checkOut: string;
  tripStart: string;
  tripEnd: string;
  dateError?: string;
  onChange: (patch: Partial<AccommodationInput>) => void;
}) {
  const tripStartDate = isIsoDateString(tripStart) ? tripStart : "";
  const tripEndDate = isIsoDateString(tripEnd) ? tripEnd : "";
  const activeCheckIn = isIsoDateString(checkIn) ? checkIn : tripStartDate;
  const nightCount = getStayNightCount(checkIn, checkOut);
  const hasDates = Boolean(checkIn || checkOut);

  function applyTripDates() {
    onChange({
      check_in: tripStartDate || checkIn,
      check_out: tripEndDate || checkOut,
    });
  }

  function setOneNightStay() {
    if (!activeCheckIn) return;
    onChange({
      check_in: activeCheckIn,
      check_out: addDaysToDateString(activeCheckIn, 1),
    });
  }

  return (
    <View style={styles.stayDateCard}>
      <Text style={styles.cardTitleSmall}>Stay dates</Text>
      <View style={styles.twoCol}>
        <View style={styles.dateInputColumn}>
          <Field
            label="Check in"
            value={checkIn}
            onChangeText={(check_in) => onChange({ check_in })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateInputColumn}>
          <Field
            label="Check out"
            value={checkOut}
            onChangeText={(check_out) => onChange({ check_out })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      {dateError ? (
        <Text style={styles.error}>{dateError}</Text>
      ) : nightCount !== null ? (
        <Text style={styles.helperText}>
          {nightCount} {nightCount === 1 ? "night" : "nights"} selected.
        </Text>
      ) : (
        <Text style={styles.helperText}>Tip: use the quick buttons below instead of typing dates from scratch.</Text>
      )}
      <View style={styles.segmentWrap}>
        <DateQuickButton
          styles={styles}
          label="Use trip dates"
          disabled={!tripStartDate && !tripEndDate}
          onPress={applyTripDates}
        />
        <DateQuickButton
          styles={styles}
          label="In = trip start"
          disabled={!tripStartDate}
          onPress={() => onChange({ check_in: tripStartDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Out = trip end"
          disabled={!tripEndDate}
          onPress={() => onChange({ check_out: tripEndDate })}
        />
        <DateQuickButton
          styles={styles}
          label="1 night"
          disabled={!activeCheckIn}
          onPress={setOneNightStay}
        />
        <DateQuickButton
          styles={styles}
          label="Clear"
          disabled={!hasDates}
          onPress={() => onChange({ check_in: "", check_out: "" })}
        />
      </View>
    </View>
  );
}

export function DateSelectorButton({
  styles,
  label,
  value,
  active,
  disabled,
  onPress,
}: {
  styles: AppStyles;
  label: string;
  value: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} date`}
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      disabled={disabled}
      style={[styles.dateField, active && styles.dateFieldActive, disabled && styles.dateFieldDisabled]}
      onPress={onPress}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.dateFieldValue, !value && styles.dateFieldPlaceholder]}>
        {value || "Select date"}
      </Text>
    </Pressable>
  );
}

export function InlineCalendarPicker({
  styles,
  label,
  selectedDate,
  cursor,
  onChangeMonth,
  onSelectDate,
  onClearDate,
  onClose,
}: {
  styles: AppStyles;
  label: string;
  selectedDate: string;
  cursor: CalendarCursor;
  onChangeMonth: (offset: number) => void;
  onSelectDate: (value: string) => void;
  onClearDate: () => void;
  onClose: () => void;
}) {
  const weeks = buildCalendarWeeks(cursor);
  const todayIso = getTodayIsoDate();

  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <View style={styles.rowCardText}>
          <Text style={styles.cardTitleSmall}>{label}</Text>
          <Text style={styles.cardMeta}>{selectedDate || "No date selected"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={styles.textButton} onPress={onClose}>
          <Text style={styles.textButtonLabel}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.calendarMonthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show previous month" style={styles.calendarNavButton} onPress={() => onChangeMonth(-1)}>
          <Text style={styles.calendarNavText}>Prev</Text>
        </Pressable>
        <Text style={styles.calendarMonthLabel}>{formatCalendarMonth(cursor)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Show next month" style={styles.calendarNavButton} onPress={() => onChangeMonth(1)}>
          <Text style={styles.calendarNavText}>Next</Text>
        </Pressable>
      </View>

      <View style={styles.calendarWeekdaysRow}>
        {calendarWeekdayLabels.map((weekday) => (
          <Text key={weekday} style={styles.calendarWeekdayLabel}>
            {weekday}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={`calendar-week-${index}`} style={styles.calendarDaysRow}>
          {week.map((day) => {
            const selected = day.iso === selectedDate;
            const today = day.iso === todayIso;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${day.iso}`}
                key={day.iso}
                style={[
                  styles.calendarDayButton,
                  !day.inMonth && styles.calendarDayButtonMuted,
                  today && styles.calendarDayButtonToday,
                  selected && styles.calendarDayButtonSelected,
                ]}
                onPress={() => onSelectDate(day.iso)}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    !day.inMonth && styles.calendarDayTextMuted,
                    selected && styles.calendarDayTextSelected,
                  ]}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Use today for this date" style={styles.actionMiniButton} onPress={() => onSelectDate(todayIso)}>
          <Text style={styles.actionMiniText}>Today</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear selected date"
          accessibilityState={{ disabled: !selectedDate }}
          disabled={!selectedDate}
          style={[styles.actionMiniButton, !selectedDate && styles.disabled]}
          onPress={onClearDate}
        >
          <Text style={styles.actionMiniText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DateQuickButton({
  styles,
  label,
  active,
  disabled,
  onPress,
}: {
  styles: AppStyles;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={[styles.filterChip, active && styles.filterChipActive, disabled && styles.disabled]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

type CalendarCursor = {
  year: number;
  month: number;
};

type CalendarDay = {
  iso: string;
  day: number;
  inMonth: boolean;
};

function buildCalendarWeeks(cursor: CalendarCursor) {
  const firstDayOfMonth = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const weeks: CalendarDay[][] = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week: CalendarDay[] = [];

    for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
      const cellIndex = weekIndex * 7 + weekdayIndex;
      const dayOfMonth = cellIndex - firstDayOfMonth + 1;

      if (dayOfMonth < 1) {
        const previous = normalizeCalendarCursor(cursor.year, cursor.month - 1);
        week.push({
          iso: formatIsoDate(previous.year, previous.month + 1, daysInPreviousMonth + dayOfMonth),
          day: daysInPreviousMonth + dayOfMonth,
          inMonth: false,
        });
        continue;
      }

      if (dayOfMonth > daysInMonth) {
        const next = normalizeCalendarCursor(cursor.year, cursor.month + 1);
        week.push({
          iso: formatIsoDate(next.year, next.month + 1, dayOfMonth - daysInMonth),
          day: dayOfMonth - daysInMonth,
          inMonth: false,
        });
        continue;
      }

      week.push({
        iso: formatIsoDate(cursor.year, cursor.month + 1, dayOfMonth),
        day: dayOfMonth,
        inMonth: true,
      });
    }

    weeks.push(week);
  }

  return weeks;
}

function formatCalendarMonth(cursor: CalendarCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function shiftCalendarCursor(cursor: CalendarCursor, offset: number) {
  return normalizeCalendarCursor(cursor.year, cursor.month + offset);
}

export function getCalendarCursor(value: string) {
  if (!isIsoDateString(value)) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }

  const [yearText, monthText] = value.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText) - 1,
  };
}

function normalizeCalendarCursor(year: number, month: number) {
  const normalized = new Date(year, month, 1);
  return {
    year: normalized.getFullYear(),
    month: normalized.getMonth(),
  };
}

export function getTodayIsoDate() {
  const today = new Date();
  return formatIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
